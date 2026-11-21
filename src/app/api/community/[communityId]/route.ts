import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), name: z.string().trim().min(2).max(60).optional(), description: z.string().max(500).optional() }),
  z.object({ action: z.literal("addGroup"), groupId: z.string().min(1) }),
  z.object({ action: z.literal("removeGroup"), groupId: z.string().min(1) }),
  z.object({ action: z.literal("inviteMember"), memberId: z.string().min(1) }),
  z.object({ action: z.literal("addMember"), memberId: z.string().trim().min(1).max(128) }),
  z.object({ action: z.literal("acceptInvite") }),
  z.object({ action: z.literal("declineInvite") }),
  z.object({ action: z.literal("removeMember"), memberId: z.string().min(1) }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("delete") })
])

const atomicCommunityMutation = `
local current = redis.call("GET", KEYS[1])
if current ~= ARGV[1] then return 0 end
local operations = cjson.decode(ARGV[3])
for _, op in ipairs(operations) do
  if op.type == "casSet" and redis.call("GET", KEYS[op.keyIndex]) ~= op.expected then return 0 end
end
if ARGV[2] == "__DELETE__" then redis.call("DEL", KEYS[1]) else redis.call("SET", KEYS[1], ARGV[2]) end
for _, op in ipairs(operations) do
  if op.type == "casSet" or op.type == "set" then
    redis.call("SET", KEYS[op.keyIndex], op.value)
  elseif op.type == "del" then
    redis.call("DEL", KEYS[op.keyIndex])
  elseif op.type == "sadd" then
    redis.call("SADD", KEYS[op.keyIndex], op.value)
  elseif op.type == "srem" then
    redis.call("SREM", KEYS[op.keyIndex], op.value)
  end
end
return 1
`

function decode<T>(raw: unknown): T {
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as T
}

async function resolveCommunityMemberId(input: string): Promise<string | null> {
  const value = input.trim()
  if (!value) return null
  // Accept either the internal ID or the account email shown in the UI.
  const normalizedEmail = value.toLowerCase()
  const indexedId = await db.get(`user:email:${normalizedEmail}`) as string | null
  const candidateId = indexedId || value
  const user = await db.get(`user:${candidateId}`)
  return user ? candidateId : null
}

export async function POST(req: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) return Response.json({ message: "Invalid community action" }, { status: 400 })

    const action = parsed.data.action
    const communityKey = `community:${communityId}`

    // Retry optimistic compare-and-set if another admin changed this community
    // after our read. Invitation decline removes both reciprocal indexes in the
    // same Lua transaction, so the invitation cannot be left half-pending.
    for (let attempt = 0; attempt < 4; attempt++) {
      const raw = await db.get(communityKey)
      if (!raw) return Response.json({ message: "Community not found" }, { status: 404 })
      const expectedRaw = typeof raw === "string" ? raw : JSON.stringify(raw)
      const community = decode<any>(raw)
      const isMember = (community.memberIds || []).includes(userId)
      const isAdmin = (community.adminIds || [community.ownerId]).includes(userId)

      if (action === "acceptInvite" || action === "declineInvite") {
        const invited = await db.sismember(`community:${communityId}:invites`, userId)
        if (!invited) return Response.json({ message: "No pending invitation" }, { status: 404 })
      } else if (!isMember) {
        return Response.json({ message: "Not a community member" }, { status: 403 })
      }
      if (action === "delete" && userId !== community.ownerId) {
        return Response.json({ message: "Only the community owner can delete it" }, { status: 403 })
      }
      if (action !== "leave" && action !== "delete" && action !== "acceptInvite" && action !== "declineInvite" && !isAdmin) {
        return Response.json({ message: "Only community admins can manage it" }, { status: 403 })
      }

      const next = { ...community, memberIds: [...(community.memberIds || [])], groupIds: [...(community.groupIds || [])], adminIds: [...(community.adminIds || [])] }
      const ops: any[] = []
      let deleteCommunity = false

      if (parsed.data.action === "update") {
        if (parsed.data.name !== undefined) next.name = parsed.data.name
        if (parsed.data.description !== undefined) next.description = parsed.data.description
      } else if (parsed.data.action === "addGroup") {
        const groupId = parsed.data.groupId
        const groupKey = `group:${groupId}`
        const groupRaw = await db.get(groupKey)
        if (!groupRaw) return Response.json({ message: "Group not found" }, { status: 404 })
        const group = decode<Group>(groupRaw)
        if (!(group.adminIds || [group.creatorId]).includes(userId)) return Response.json({ message: "You must administer the group" }, { status: 403 })
        const expectedGroupRaw = typeof groupRaw === "string" ? groupRaw : JSON.stringify(groupRaw)

        if (group.communityId && group.communityId !== communityId) {
          const previousKey = `community:${group.communityId}`
          const previousRaw = await db.get(previousKey)
          if (previousRaw) {
            const previous = decode<any>(previousRaw)
            previous.groupIds = (previous.groupIds || []).filter((id: string) => id !== groupId)
            previous.updatedAt = Date.now()
            ops.push({ type: "casSet", key: previousKey, expected: typeof previousRaw === "string" ? previousRaw : JSON.stringify(previousRaw), value: JSON.stringify(previous) })
          }
        }

        next.groupIds = Array.from(new Set([...next.groupIds, groupId]))
        const groupMembers = await db.smembers(`group:${groupId}:members`) as string[]
        const linkedMembers = Array.from(new Set([...(groupMembers || []), group.creatorId]))
        next.memberIds = Array.from(new Set([...next.memberIds, ...linkedMembers]))
        for (const memberId of linkedMembers) ops.push({ type: "sadd", key: `user:${memberId}:communities`, value: communityId })
        ops.push({ type: "casSet", key: groupKey, expected: expectedGroupRaw, value: JSON.stringify({ ...group, communityId: communityId, updatedAt: Date.now() }) })
      } else if (parsed.data.action === "removeGroup") {
        const groupId = parsed.data.groupId
        next.groupIds = next.groupIds.filter((id: string) => id !== groupId)
        const groupKey = `group:${groupId}`
        const groupRaw = await db.get(groupKey)
        if (groupRaw) {
          const group = decode<Group>(groupRaw)
          if (group.communityId === communityId) {
            const { communityId: _communityId, ...withoutCommunity } = group
            ops.push({ type: "casSet", key: groupKey, expected: typeof groupRaw === "string" ? groupRaw : JSON.stringify(groupRaw), value: JSON.stringify({ ...withoutCommunity, updatedAt: Date.now() }) })
          }
        }
      } else if (parsed.data.action === "inviteMember") {
        const targetId = await resolveCommunityMemberId(parsed.data.memberId)
        if (!targetId) return Response.json({ message: "No account matches that email address or user ID" }, { status: 404 })
        if (next.memberIds.includes(targetId)) return Response.json({ message: "User is already a member" }, { status: 409 })
        ops.push({ type: "sadd", key: `community:${communityId}:invites`, value: targetId })
        ops.push({ type: "sadd", key: `user:${targetId}:community-invites`, value: communityId })
      } else if (parsed.data.action === "addMember") {
        const targetId = await resolveCommunityMemberId(parsed.data.memberId)
        if (!targetId) return Response.json({ message: "No account matches that email address or user ID" }, { status: 404 })
        if (next.memberIds.includes(targetId)) return Response.json({ message: "User is already a community member" }, { status: 409 })
        next.memberIds.push(targetId)
        ops.push({ type: "sadd", key: `user:${targetId}:communities`, value: communityId })
        // If this user had a pending invitation, direct admin addition makes
        // that invitation obsolete; clear both sides of its index atomically.
        ops.push({ type: "srem", key: `community:${communityId}:invites`, value: targetId })
        ops.push({ type: "srem", key: `user:${targetId}:community-invites`, value: communityId })
      } else if (parsed.data.action === "acceptInvite") {
        next.memberIds = Array.from(new Set([...next.memberIds, userId]))
        ops.push({ type: "srem", key: `community:${communityId}:invites`, value: userId })
        ops.push({ type: "srem", key: `user:${userId}:community-invites`, value: communityId })
        ops.push({ type: "sadd", key: `user:${userId}:communities`, value: communityId })
      } else if (parsed.data.action === "declineInvite") {
        // Idempotent removal from both sides of the invitation index.
        ops.push({ type: "srem", key: `community:${communityId}:invites`, value: userId })
        ops.push({ type: "srem", key: `user:${userId}:community-invites`, value: communityId })
      } else if (parsed.data.action === "removeMember") {
        const targetId = parsed.data.memberId
        if (targetId === community.ownerId) return Response.json({ message: "Transfer ownership before removing the owner" }, { status: 400 })
        if (!next.memberIds.includes(targetId)) return Response.json({ message: "User is not a community member" }, { status: 404 })
        next.memberIds = next.memberIds.filter((id: string) => id !== targetId)
        next.adminIds = next.adminIds.filter((id: string) => id !== targetId)
        ops.push({ type: "srem", key: `user:${targetId}:communities`, value: communityId })
      } else if (parsed.data.action === "delete") {
        deleteCommunity = true
        for (const memberId of next.memberIds) {
          ops.push({ type: "srem", key: `user:${memberId}:communities`, value: communityId })
        }
        const inviteIds = await db.smembers(`community:${communityId}:invites`) as string[]
        for (const inviteeId of inviteIds || []) {
          ops.push({ type: "srem", key: `user:${inviteeId}:community-invites`, value: communityId })
        }
        ops.push({ type: "del", key: `community:${communityId}:invites` })
        for (const groupId of next.groupIds) {
          const groupKey = `group:${groupId}`
          const groupRaw = await db.get(groupKey)
          if (groupRaw) {
            const group = decode<Group>(groupRaw)
            if (group.communityId === communityId) {
              const { communityId: _communityId, ...withoutCommunity } = group
              ops.push({ type: "casSet", key: groupKey, expected: typeof groupRaw === "string" ? groupRaw : JSON.stringify(groupRaw), value: JSON.stringify({ ...withoutCommunity, updatedAt: Date.now() }) })
            }
          }
        }
      } else if (parsed.data.action === "leave") {
        next.memberIds = next.memberIds.filter((id: string) => id !== userId)
        next.adminIds = next.adminIds.filter((id: string) => id !== userId)
        ops.push({ type: "srem", key: `user:${userId}:communities`, value: communityId })
        if (next.memberIds.length === 0) {
          deleteCommunity = true
          const inviteIds = await db.smembers(`community:${communityId}:invites`) as string[]
          for (const inviteeId of inviteIds || []) ops.push({ type: "srem", key: `user:${inviteeId}:community-invites`, value: communityId })
          ops.push({ type: "del", key: `community:${communityId}:invites` })
          for (const groupId of next.groupIds) {
            const groupKey = `group:${groupId}`
            const groupRaw = await db.get(groupKey)
            if (groupRaw) {
              const group = decode<Group>(groupRaw)
              if (group.communityId === communityId) {
                const { communityId: _communityId, ...withoutCommunity } = group
                ops.push({ type: "casSet", key: groupKey, expected: typeof groupRaw === "string" ? groupRaw : JSON.stringify(groupRaw), value: JSON.stringify(withoutCommunity) })
              }
            }
          }
        } else if (community.ownerId === userId) {
          next.ownerId = next.memberIds[0]
          next.adminIds = Array.from(new Set([...next.adminIds, next.ownerId]))
        }
      }

      next.updatedAt = Date.now()
      const redisKeys = [communityKey]
      const indexedOps = ops.map(operation => {
        let index = redisKeys.indexOf(operation.key)
        if (index === -1) {
          redisKeys.push(operation.key)
          index = redisKeys.length - 1
        }
        return { ...operation, keyIndex: index + 1 }
      })
      const result = await db.eval(atomicCommunityMutation, redisKeys, [
        expectedRaw,
        deleteCommunity ? "__DELETE__" : JSON.stringify(next),
        JSON.stringify(indexedOps)
      ])
      if (Number(result) === 1) {
        return Response.json({ success: true, declined: action === "declineInvite", deleted: deleteCommunity, community: deleteCommunity ? undefined : next })
      }
    }

    return Response.json({ message: "Community changed concurrently. Please retry." }, { status: 409 })
  } catch (error) {
    console.error("[community] Mutation failed:", error)
    return Response.json({ message: "Unable to update community" }, { status: 500 })
  }
}
