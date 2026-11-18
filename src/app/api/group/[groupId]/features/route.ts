import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { nanoid } from "nanoid"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createPoll"), question: z.string().trim().min(3).max(240), options: z.array(z.string().trim().min(1).max(100)).min(2).max(10), multiple: z.boolean().default(false) }),
  z.object({ action: z.literal("votePoll"), pollId: z.string().min(1), optionIds: z.array(z.string().min(1)).min(1).max(10) }),
  z.object({ action: z.literal("createEvent"), title: z.string().trim().min(3).max(120), description: z.string().max(1000).optional(), startsAt: z.number().int().positive(), location: z.string().max(200).optional() }),
  z.object({ action: z.literal("respondEvent"), eventId: z.string().min(1), response: z.enum(["going", "maybe", "not-going"]) }),
  z.object({ action: z.literal("announce"), text: z.string().trim().min(1).max(2000) })
])

// The entire feature document is updated inside one Redis Lua execution.
// This prevents concurrent requests from overwriting each other's votes,
// RSVPs, polls, events, or announcements.
const atomicFeatureUpdate = `
local raw = redis.call("GET", KEYS[1])
local features = raw and cjson.decode(raw) or cjson.decode('{"polls":[],"events":[],"announcements":[]}')
features.polls = features.polls or cjson.decode("[]")
features.events = features.events or cjson.decode("[]")
features.announcements = features.announcements or cjson.decode("[]")
local userId = ARGV[1]
local action = ARGV[2]
local payload = cjson.decode(ARGV[3])
local result = nil

if action == "createPoll" then
  table.insert(features.polls, 1, payload)
  while #features.polls > 100 do table.remove(features.polls) end
  result = payload
elseif action == "votePoll" then
  local poll = nil
  for _, item in ipairs(features.polls) do if item.id == payload.pollId then poll = item break end end
  if not poll or poll.closed then return cjson.encode({error = "Poll is unavailable"}) end
  local selected = {}
  for _, id in ipairs(payload.optionIds) do
    local found = false
    for _, option in ipairs(poll.options or {}) do if option.id == id then found = true break end end
    if not found then return cjson.encode({error = "Invalid poll selection"}) end
    if not selected[id] then selected[id] = true end
  end
  local count = 0
  for _ in pairs(selected) do count = count + 1 end
  if (not poll.multiple and count ~= 1) then return cjson.encode({error = "Invalid poll selection"}) end
  for _, option in ipairs(poll.options or {}) do
    option.votes = option.votes or cjson.decode("[]")
    for i = #option.votes, 1, -1 do if option.votes[i] == userId then table.remove(option.votes, i) end end
  end
  for _, option in ipairs(poll.options or {}) do
    if selected[option.id] then table.insert(option.votes, userId) end
  end
  result = poll
elseif action == "createEvent" then
  table.insert(features.events, 1, payload)
  while #features.events > 100 do table.remove(features.events) end
  result = payload
elseif action == "respondEvent" then
  local event = nil
  for _, item in ipairs(features.events) do if item.id == payload.eventId then event = item break end end
  if not event then return cjson.encode({error = "Event not found"}) end
  event.responses = event.responses or {going = cjson.decode("[]"), maybe = cjson.decode("[]"), ["not-going"] = cjson.decode("[]")}
  for _, status in ipairs({"going", "maybe", "not-going"}) do
    event.responses[status] = event.responses[status] or cjson.decode("[]")
    for i = #event.responses[status], 1, -1 do if event.responses[status][i] == userId then table.remove(event.responses[status], i) end end
  end
  table.insert(event.responses[payload.response], userId)
  result = event
elseif action == "announce" then
  table.insert(features.announcements, 1, payload)
  while #features.announcements > 100 do table.remove(features.announcements) end
  result = payload
else
  return cjson.encode({error = "Unsupported action"})
end

redis.call("SET", KEYS[1], cjson.encode(features))
return cjson.encode({features = features, result = result})
`

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) return Response.json({ message: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })

    const rawGroup = await db.get(`group:${groupId}`)
    if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
    const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
    if (!(group.memberIds || []).includes(userId)) return Response.json({ message: "Not a group member" }, { status: 403 })

    const action = parsed.data.action
    const isAdmin = (group.adminIds || [group.creatorId]).includes(userId)
    const adminOnly = (action === "createPoll" && group.settings?.onlyAdminsCanCreatePolls) ||
      (action === "createEvent" && group.settings?.onlyAdminsCanCreateEvents) ||
      (action === "announce" && (group.settings?.announcementsOnly || group.settings?.onlyAdminsCanSendMessages))
    if (adminOnly && !isAdmin) return Response.json({ message: "Only group admins can perform this action" }, { status: 403 })

    const now = Date.now()
    let payload: Record<string, any>
    if (parsed.data.action === "createPoll") {
      payload = { id: nanoid(), question: parsed.data.question, options: parsed.data.options.map(label => ({ id: nanoid(), label, votes: [] })), multiple: parsed.data.multiple, createdBy: userId, createdAt: now, closed: false }
    } else if (parsed.data.action === "createEvent") {
      if (parsed.data.startsAt < now) return Response.json({ message: "Event must be in the future" }, { status: 400 })
      const { action: _action, ...eventData } = parsed.data
      payload = { id: nanoid(), ...eventData, createdBy: userId, createdAt: now, responses: { going: [], maybe: [], "not-going": [] } }
    } else if (parsed.data.action === "announce") {
      payload = { id: nanoid(), text: parsed.data.text, createdBy: userId, createdAt: now }
    } else if (parsed.data.action === "votePoll") {
      payload = { pollId: parsed.data.pollId, optionIds: Array.from(new Set(parsed.data.optionIds)) }
    } else {
      payload = { eventId: parsed.data.eventId, response: parsed.data.response }
    }

    const key = `group:${groupId}:features`
    const rawResult = await db.eval(atomicFeatureUpdate, [key], [userId, action, JSON.stringify(payload)])
    const updated = typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult as any
    if (updated?.error) {
      const status = updated.error === "Poll is unavailable" || updated.error === "Event not found" ? 404 : 400
      return Response.json({ message: updated.error }, { status })
    }

    await Promise.allSettled([
      pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "group_feature_updated", { action, result: updated.result })
    ])
    return Response.json({ success: true, result: updated.result, features: updated.features })
  } catch (error) {
    console.error("Group feature action failed:", error)
    return Response.json({ message: "Unable to update group feature" }, { status: 500 })
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
    const rawGroup = await db.get(`group:${groupId}`)
    if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
    const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
    if (!(group.memberIds || []).includes(userId)) return Response.json({ message: "Not a group member" }, { status: 403 })
    const raw = await db.get(`group:${groupId}:features`)
    const features = (typeof raw === "string" ? JSON.parse(raw) : raw) || { polls: [], events: [], announcements: [] }
    features.polls = (features.polls || []).map((poll: any) => ({
      ...poll,
      myOptionIds: (poll.options || []).filter((option: any) => (option.votes || []).includes(userId)).map((option: any) => option.id)
    }))
    return Response.json({ features })
  } catch (error) {
    console.error("Group feature read failed:", error)
    return Response.json({ message: "Unable to load group features" }, { status: 500 })
  }
}
