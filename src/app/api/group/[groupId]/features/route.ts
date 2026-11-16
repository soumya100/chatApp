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

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) return Response.json({ message: parsed.error.errors[0]?.message || "Invalid request" }, { status: 400 })

    const groupId = params.groupId
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

    const key = `group:${groupId}:features`
    const rawFeatures = await db.get(key)
    const features = (typeof rawFeatures === "string" ? JSON.parse(rawFeatures) : rawFeatures) || { polls: [], events: [], announcements: [] }
    let result: any = null
    const now = Date.now()

    if (action === "createPoll") {
      result = { id: nanoid(), question: parsed.data.question, options: parsed.data.options.map(label => ({ id: nanoid(), label, votes: [] })), multiple: parsed.data.multiple, createdBy: userId, createdAt: now, closed: false }
      features.polls = [result, ...(features.polls || [])].slice(0, 100)
    } else if (action === "votePoll") {
      const poll = (features.polls || []).find((item: any) => item.id === parsed.data.pollId)
      if (!poll || poll.closed) return Response.json({ message: "Poll is unavailable" }, { status: 404 })
      const optionIds = Array.from(new Set(parsed.data.optionIds))
      if ((!poll.multiple && optionIds.length !== 1) || optionIds.some(id => !poll.options.some((option: any) => option.id === id))) return Response.json({ message: "Invalid poll selection" }, { status: 400 })
      poll.options.forEach((option: any) => { option.votes = (option.votes || []).filter((id: string) => id !== userId) })
      optionIds.forEach(id => { const option = poll.options.find((item: any) => item.id === id); option.votes.push(userId) })
      result = poll
    } else if (action === "createEvent") {
      if (parsed.data.startsAt < now - 60000) return Response.json({ message: "Event must be in the future" }, { status: 400 })
      result = { id: nanoid(), ...parsed.data, createdBy: userId, createdAt: now, responses: { going: [], maybe: [], "not-going": [] } }
      features.events = [result, ...(features.events || [])].slice(0, 100)
    } else if (action === "respondEvent") {
      const event = (features.events || []).find((item: any) => item.id === parsed.data.eventId)
      if (!event) return Response.json({ message: "Event not found" }, { status: 404 })
      Object.keys(event.responses || {}).forEach(status => { event.responses[status] = event.responses[status].filter((id: string) => id !== userId) })
      event.responses[parsed.data.response].push(userId)
      result = event
    } else {
      result = { id: nanoid(), text: parsed.data.text, createdBy: userId, createdAt: now }
      features.announcements = [result, ...(features.announcements || [])].slice(0, 100)
    }

    await db.set(key, JSON.stringify(features))
    await Promise.allSettled([
      pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "group_feature_updated", { action, result })
    ])
    return Response.json({ success: true, result, features })
  } catch (error) {
    console.error("Group feature action failed:", error)
    return Response.json({ message: "Unable to update group feature" }, { status: 500 })
  }
}

export async function GET(_req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
    const rawGroup = await db.get(`group:${params.groupId}`)
    if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
    const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
    if (!(group.memberIds || []).includes(userId)) return Response.json({ message: "Not a group member" }, { status: 403 })
    const raw = await db.get(`group:${params.groupId}:features`)
    const features = (typeof raw === "string" ? JSON.parse(raw) : raw) || { polls: [], events: [], announcements: [] }
    return Response.json({ features })
  } catch (error) {
    console.error("Group feature read failed:", error)
    return Response.json({ message: "Unable to load group features" }, { status: 500 })
  }
}
