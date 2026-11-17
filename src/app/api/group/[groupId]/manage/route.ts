import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("update"),
        name: z.string().trim().min(2).max(50).optional(),
        description: z.string().trim().max(500).optional(),
        image: z.string().url().optional(),
        settings: z.object({
            onlyAdminsCanEditInfo: z.boolean().optional(),
            onlyAdminsCanAddMembers: z.boolean().optional(),
            onlyAdminsCanSendMessages: z.boolean().optional(),
            approvalRequired: z.boolean().optional(),
            disappearingMessagesSeconds: z.number().int().min(0).max(31536000).optional(),
            onlyAdminsCanPinMessages: z.boolean().optional(),
            onlyAdminsCanCreatePolls: z.boolean().optional(),
            onlyAdminsCanCreateEvents: z.boolean().optional(),
            announcementsOnly: z.boolean().optional(),
            allowMemberInvites: z.boolean().optional()
        }).optional()
    }),
    z.object({ action: z.literal("promote"), memberId: z.string().min(1) }),
    z.object({ action: z.literal("demote"), memberId: z.string().min(1) }),
    z.object({ action: z.literal("remove"), memberId: z.string().min(1) }),
    z.object({ action: z.literal("leave") })
])

// Compare-and-set the group document and all membership indexes in one Redis
// transaction. All authorization decisions are repeated against the document
// version being committed, preventing concurrent admin changes from being lost.
const atomicGroupMutation = `
local current = redis.call("GET", KEYS[1])
if current ~= ARGV[1] then return 0 end

local action = ARGV[2]
local nextGroup = ARGV[3]
local actorId = ARGV[4]
local groupId = ARGV[5]
local removedIds = cjson.decode(ARGV[6])
local systemMessage = ARGV[7]
local deleteGroup = ARGV[8] == "true"

if deleteGroup then
  redis.call("DEL", KEYS[1], KEYS[2], KEYS[5])
  redis.call("ZREMRANGEBYRANK", KEYS[4], 0, -1)
  redis.call("DEL", KEYS[4])
  redis.call("SREM", KEYS[3], groupId)
  return 1
end

redis.call("SET", KEYS[1], nextGroup)
for index, memberId in ipairs(removedIds) do
  redis.call("SREM", KEYS[2], memberId)
  redis.call("SREM", KEYS[5 + index], groupId)
end
if action == "leave" or action == "remove" then
  local message = cjson.decode(systemMessage)
  redis.call("ZADD", KEYS[4], tonumber(message.timestamp), systemMessage)
end
return 1
`

function decode<T>(raw: unknown): T {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T
}

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
    try {
        const session = await getServerSession(authOptions)
        const actorId = session?.user?.id
        if (!actorId) return Response.json({ message: "Unauthorized" }, { status: 401 })

        const parsed = schema.safeParse(await req.json())
        if (!parsed.success) {
            return Response.json({ message: parsed.error.errors[0]?.message || "Invalid request" }, { status: 400 })
        }

        const groupId = params.groupId
        const action = parsed.data.action
        const groupKey = `group:${groupId}`
        const membersKey = `group:${groupId}:members`
        const userGroupsKey = `user:${actorId}:groups`
        const messagesKey = `chat:group--${groupId}:messages`
        const featuresKey = `group:${groupId}:features`

        for (let attempt = 0; attempt < 4; attempt++) {
            const raw = await db.get(groupKey)
            if (!raw) return Response.json({ message: "Group not found" }, { status: 404 })
            const expectedRaw = typeof raw === "string" ? raw : JSON.stringify(raw)
            const group = decode<Group>(raw)
            const memberIds = group.memberIds || []
            const adminIds = group.adminIds || [group.creatorId]
            const isMember = memberIds.includes(actorId)
            const isAdmin = adminIds.includes(actorId)
            if (!isMember) return Response.json({ message: "You are not a member of this group" }, { status: 403 })

            let updatedGroup: Group = { ...group }
            let removedIds: string[] = []
            let deleteGroup = false

            if (action === "update") {
                const data = parsed.data
                const changingInfo = data.name !== undefined || data.description !== undefined || data.image !== undefined
                if (data.settings !== undefined && !isAdmin) {
                    return Response.json({ message: "Only admins can change group settings" }, { status: 403 })
                }
                if (changingInfo && !isAdmin && group.settings?.onlyAdminsCanEditInfo) {
                    return Response.json({ message: "Only admins can edit group information" }, { status: 403 })
                }
                updatedGroup = {
                    ...group,
                    ...(data.name !== undefined ? { name: data.name } : {}),
                    ...(data.description !== undefined ? { description: data.description } : {}),
                    ...(data.image !== undefined ? { image: data.image } : {}),
                    settings: {
                        onlyAdminsCanEditInfo: false,
                        onlyAdminsCanAddMembers: false,
                        onlyAdminsCanSendMessages: false,
                        approvalRequired: false,
                        disappearingMessagesSeconds: 0,
                        onlyAdminsCanPinMessages: false,
                        onlyAdminsCanCreatePolls: false,
                        onlyAdminsCanCreateEvents: false,
                        announcementsOnly: false,
                        allowMemberInvites: true,
                        ...group.settings,
                        ...data.settings
                    },
                    updatedAt: Date.now()
                }
            } else if (action === "leave") {
                const remaining = memberIds.filter(id => id !== actorId)
                if (remaining.length === 0) {
                    deleteGroup = true
                    removedIds = [actorId]
                } else {
                    let nextAdmins = adminIds.filter(id => id !== actorId)
                    if (actorId === group.creatorId || nextAdmins.length === 0) {
                        const nextAdmin = remaining[0]
                        nextAdmins = Array.from(new Set([...nextAdmins, nextAdmin]))
                        updatedGroup.creatorId = nextAdmin
                    }
                    updatedGroup.memberIds = remaining
                    updatedGroup.adminIds = nextAdmins
                    updatedGroup.updatedAt = Date.now()
                    removedIds = [actorId]
                }
            } else {
                const targetId = parsed.data.memberId
                if (!memberIds.includes(targetId)) {
                    return Response.json({ message: "Target user is not a group member" }, { status: 404 })
                }
                if (!isAdmin) return Response.json({ message: "Only admins can manage members" }, { status: 403 })
                if (action === "promote" || action === "demote") {
                    if (actorId !== group.creatorId) {
                        return Response.json({ message: "Only the group creator can change admin roles" }, { status: 403 })
                    }
                    if (targetId === group.creatorId) {
                        return Response.json({ message: "The group creator must remain an admin" }, { status: 400 })
                    }
                    const nextAdmins = new Set(adminIds)
                    if (action === "promote") nextAdmins.add(targetId)
                    else nextAdmins.delete(targetId)
                    updatedGroup.adminIds = Array.from(nextAdmins)
                } else {
                    if (targetId === group.creatorId) {
                        return Response.json({ message: "Transfer group ownership before removing the creator" }, { status: 400 })
                    }
                    updatedGroup.memberIds = memberIds.filter(id => id !== targetId)
                    updatedGroup.adminIds = adminIds.filter(id => id !== targetId)
                    removedIds = [targetId]
                }
                updatedGroup.updatedAt = Date.now()
            }

            const systemMessage: Message | null = action === "leave" || action === "remove" ? {
                id: `group-event-${Date.now()}-${actorId}`,
                senderId: "system",
                receiverId: `group--${groupId}`,
                text: action === "leave"
                    ? `${session.user.name || "A member"} left the group`
                    : `${session.user.name || "An admin"} removed a member`,
                timestamp: Date.now(),
                senderName: "System"
            } : null

            const redisKeys = [groupKey, membersKey, userGroupsKey, messagesKey, featuresKey,
                ...removedIds.map(id => `user:${id}:groups`)]
            const result = await db.eval(atomicGroupMutation,
                redisKeys,
                [
                    expectedRaw,
                    action,
                    deleteGroup ? "" : JSON.stringify(updatedGroup),
                    actorId,
                    groupId,
                    JSON.stringify(removedIds),
                    systemMessage ? JSON.stringify(systemMessage) : "",
                    String(deleteGroup)
                ]
            )

            if (Number(result) !== 1) continue

            if (deleteGroup) {
                await Promise.allSettled([
                    pusherServer.trigger(toPusherKey(`private-user:${actorId}:groups`), "group_removed", { groupId }),
                    pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "group_deleted", { groupId })
                ])
                return Response.json({ success: true, deleted: true })
            }

            await Promise.allSettled([
                pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "group_updated", updatedGroup),
                ...removedIds.map(id => pusherServer.trigger(
                    toPusherKey(`private-user:${id}:groups`), "group_removed", { groupId }
                )),
                ...updatedGroup.memberIds.map(id => pusherServer.trigger(
                    toPusherKey(`private-user:${id}:groups`), "group_updated", updatedGroup
                ))
            ])
            return Response.json({ success: true, group: updatedGroup, removed: removedIds })
        }

        return Response.json({ message: "Group changed concurrently. Please retry." }, { status: 409 })
    } catch (error) {
        console.error("Group management error:", error)
        return Response.json({ message: "Failed to update group" }, { status: 500 })
    }
}
