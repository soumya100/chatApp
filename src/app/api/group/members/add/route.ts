import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { resolveAdminIds } from "@/lib/group"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { nanoid } from "nanoid"
import { z } from "zod"

export const dynamic = "force-dynamic"

const addMembersSchema = z.object({
    groupId: z.string().min(1),
    memberIds: z.array(z.string().min(1)).min(1).max(100)
})

const MAX_COMMIT_ATTEMPTS = 4

// Compare-and-set the group document, both membership indexes, the system
// message and the community index in one Redis transaction. Every
// authorization decision is repeated against the document version that is
// actually committed, so two concurrent "add members" calls can no longer
// overwrite each other's member list (the losing call retries on the fresh
// document instead).
const atomicGroupMemberAdd = `
local current = redis.call("GET", KEYS[1])
if current ~= ARGV[1] then return 0 end

local addedIds = cjson.decode(ARGV[6])
local systemMessage = ARGV[7]
local communityKey = ARGV[9]
local nextCommunity = ARGV[10]
local communityId = ARGV[11]

redis.call("SET", KEYS[1], ARGV[3])
for _, memberId in ipairs(addedIds) do
  redis.call("SADD", KEYS[2], memberId)
  redis.call("SADD", "user:" .. memberId .. ":groups", ARGV[5])
end
local message = cjson.decode(systemMessage)
redis.call("ZADD", KEYS[3], tonumber(message.timestamp), systemMessage)
if communityKey ~= "" then
  redis.call("SET", communityKey, nextCommunity)
  for _, memberId in ipairs(addedIds) do
    redis.call("SADD", "user:" .. memberId .. ":communities", communityId)
  end
end
return 1
`

function decode<T>(raw: unknown): T {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 })

        let body: unknown
        try {
            body = await req.json()
        } catch {
            return Response.json({ message: "Request body must be valid JSON" }, { status: 400 })
        }
        const parsed = addMembersSchema.safeParse(body)
        if (!parsed.success) {
            return Response.json({ message: parsed.error.issues[0]?.message || "Invalid payload" }, { status: 400 })
        }

        const { groupId, memberIds } = parsed.data
        const groupKey = `group:${groupId}`
        const membersSetKey = `group:${groupId}:members`
        const messagesKey = `chat:group--${groupId}:messages`

        let committed: { group: Group; addedCount: number; addedIds: string[]; systemMessage: Message } | null = null

        for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS && !committed; attempt++) {
            const groupRaw = await db.get(groupKey)
            if (!groupRaw) return Response.json({ message: "Group not found" }, { status: 404 })

            const expectedRaw = typeof groupRaw === "string" ? groupRaw : JSON.stringify(groupRaw)
            const group = decode<Group>(groupRaw)
            const existingMemberIds = group.memberIds || []
            const isMember = existingMemberIds.includes(session.user.id)
            if (!isMember) return Response.json({ message: "You are not a member of this group" }, { status: 403 })

            const isAdmin = resolveAdminIds(group).includes(session.user.id)
            if (group.settings?.approvalRequired && !isAdmin) {
                return Response.json(
                    { message: "A group admin must approve new members", code: "ADMIN_APPROVAL_REQUIRED" },
                    { status: 403 }
                )
            }
            if ((group.settings?.onlyAdminsCanAddMembers || group.settings?.allowMemberInvites === false) && !isAdmin) {
                return Response.json(
                    { message: "Only group admins can add members", code: "MEMBER_ADD_ADMIN_ONLY" },
                    { status: 403 }
                )
            }

            const uniqueIds = Array.from(new Set(memberIds)).filter(id => !existingMemberIds.includes(id))
            if (uniqueIds.length === 0) {
                return Response.json({ message: "Selected users are already group members" }, { status: 409 })
            }

            const usersPipeline = db.pipeline()
            uniqueIds.forEach(id => usersPipeline.get(`user:${id}`))
            const rawUsers = await usersPipeline.exec()
            const validMembers = uniqueIds.flatMap((id, index) => {
                const raw = rawUsers[index]
                if (!raw) return []
                try {
                    const user = decode<User>(raw)
                    return user?.id ? [{ id, name: user.name || "Member" }] : []
                } catch { return [] }
            })
            const validMemberIds = validMembers.map(member => member.id)
            if (!validMemberIds.length) return Response.json({ message: "No valid users were selected" }, { status: 404 })
            const addedNames = validMembers.map(member => member.name)

            const updatedGroup: Group = {
                ...group,
                memberIds: [...existingMemberIds, ...validMemberIds],
                updatedAt: Date.now()
            }
            const actorName = session.user.name || "A member"
            const systemMessage: Message = {
                id: nanoid(),
                senderId: "system",
                receiverId: `group--${groupId}`,
                text: `${actorName} added ${addedNames.length ? addedNames.join(", ") : `${uniqueIds.length} member(s)`} to the group`,
                timestamp: Date.now(),
                senderName: "System"
            }

            let communityKey = ""
            let nextCommunity = ""
            const communityId = group.communityId || ""
            if (communityId) {
                const rawCommunity = await db.get(`community:${communityId}`)
                if (rawCommunity) {
                    const community = decode<{ memberIds?: string[]; updatedAt?: number } & Record<string, unknown>>(rawCommunity)
                    community.memberIds = Array.from(new Set([...(community.memberIds || []), ...validMemberIds]))
                    community.updatedAt = Date.now()
                    communityKey = `community:${communityId}`
                    nextCommunity = JSON.stringify(community)
                }
            }

            const result = await db.eval(
                atomicGroupMemberAdd,
                [groupKey, membersSetKey, messagesKey],
                [
                    expectedRaw,
                    "addMembers",
                    JSON.stringify(updatedGroup),
                    session.user.id,
                    groupId,
                    JSON.stringify(validMemberIds),
                    JSON.stringify(systemMessage),
                    "false",
                    communityKey,
                    nextCommunity,
                    communityId
                ]
            )

            if (Number(result) === 1) {
                committed = { group: updatedGroup, addedCount: validMemberIds.length, addedIds: validMemberIds, systemMessage }
            }
        }

        if (!committed) {
            return Response.json(
                { message: "The group was updated concurrently. Please review the member list and try again." },
                { status: 409 }
            )
        }

        const { group: updatedGroup, addedCount, addedIds, systemMessage } = committed

        const fanoutResults = await Promise.allSettled([
            ...addedIds.map(id => pusherServer.trigger(
                toPusherKey(`private-user:${id}:groups`), "new_group", updatedGroup
            )),
            pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "group_members_updated", {
                group: updatedGroup, addedMemberIds: addedIds
            }),
            pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "incoming-message", systemMessage)
        ])

        // Realtime fan-out must never fail silently: every rejected delivery is
        // inspected, counted and logged (without member identifiers).
        let rejectedDeliveries = 0
        for (const fanoutResult of fanoutResults) {
            if (fanoutResult.status === "rejected") {
                rejectedDeliveries += 1
                const reason = fanoutResult.reason instanceof Error ? fanoutResult.reason.message : String(fanoutResult.reason)
                console.error(`Group membership realtime delivery rejected: ${reason}`)
            }
        }
        if (rejectedDeliveries) {
            console.error(`Group membership realtime fan-out finished with ${rejectedDeliveries} rejected delivery(ies).`)
        }

        return Response.json({ success: true, group: updatedGroup, addedCount })
    } catch (error) {
        console.error("Failed to add members to group:", error)
        return Response.json({ message: "Failed to add members to group" }, { status: 500 })
    }
}
