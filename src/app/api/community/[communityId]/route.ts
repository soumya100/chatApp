import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), name: z.string().trim().min(2).max(60).optional(), description: z.string().max(500).optional() }),
  z.object({ action: z.literal("addGroup"), groupId: z.string().min(1) }),
  z.object({ action: z.literal("removeGroup"), groupId: z.string().min(1) }),
  z.object({ action: z.literal("addMember"), memberId: z.string().min(1) }),
  z.object({ action: z.literal("removeMember"), memberId: z.string().min(1) }),
  z.object({ action: z.literal("leave") })
])

export async function POST(req: Request, { params }: { params: { communityId: string } }) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ message: "Invalid community action" }, { status: 400 })
  const raw = await db.get(`community:${params.communityId}`)
  if (!raw) return Response.json({ message: "Community not found" }, { status: 404 })
  const community = (typeof raw === "string" ? JSON.parse(raw) : raw) as any
  if (!(community.memberIds || []).includes(userId)) return Response.json({ message: "Not a community member" }, { status: 403 })
  if (parsed.data.action !== "leave" && !(community.adminIds || [community.ownerId]).includes(userId)) return Response.json({ message: "Only community admins can manage it" }, { status: 403 })
  if (parsed.data.action === "leave") {
    const remaining = (community.memberIds || []).filter((id: string) => id !== userId)
    await db.srem(`user:${userId}:communities`, params.communityId)
    if (remaining.length === 0) {
      const pipeline = db.pipeline()
      pipeline.del(`community:${params.communityId}`)
      for (const groupId of community.groupIds || []) {
        const rawGroup = await db.get(`group:${groupId}`)
        if (rawGroup) {
          const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
          if (group.communityId === params.communityId) { delete (group as any).communityId; pipeline.set(`group:${groupId}`, JSON.stringify(group)) }
        }
      }
      await pipeline.exec()
      return Response.json({ success: true, deleted: true })
    }
    community.memberIds = remaining
    if (community.ownerId === userId) {
      community.ownerId = remaining[0]
      community.adminIds = Array.from(new Set([...(community.adminIds || []).filter((id: string) => id !== userId), remaining[0]]))
    } else {
      community.adminIds = (community.adminIds || []).filter((id: string) => id !== userId)
    }
  } else if (parsed.data.action === "update") {
    if (parsed.data.name !== undefined) community.name = parsed.data.name
    if (parsed.data.description !== undefined) community.description = parsed.data.description
  } else if (parsed.data.action === "addGroup") {
    const rawGroup = await db.get(`group:${parsed.data.groupId}`)
    if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
    const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
    if (!(group.adminIds || [group.creatorId]).includes(userId)) return Response.json({ message: "You must administer the group" }, { status: 403 })
    community.groupIds = Array.from(new Set([...(community.groupIds || []), group.id]))
    await db.set(`group:${group.id}`, JSON.stringify({ ...group, communityId: params.communityId, updatedAt: Date.now() }))
  } else if (parsed.data.action === "addMember") {
    const targetId = parsed.data.memberId
    const rawUser = await db.get(`user:${targetId}`)
    if (!rawUser) return Response.json({ message: "User not found" }, { status: 404 })
    community.memberIds = Array.from(new Set([...(community.memberIds || []), targetId]))
    await db.sadd(`user:${targetId}:communities`, params.communityId)
  } else if (parsed.data.action === "removeMember") {
    const targetId = parsed.data.memberId
    if (targetId === community.ownerId) return Response.json({ message: "Transfer ownership before removing the owner" }, { status: 400 })
    community.memberIds = (community.memberIds || []).filter((id: string) => id !== targetId)
    await db.srem(`user:${targetId}:communities`, params.communityId)
  } else if (parsed.data.action === "removeGroup") {
    community.groupIds = (community.groupIds || []).filter((id: string) => id !== parsed.data.groupId)
    const rawGroup = await db.get(`group:${parsed.data.groupId}`)
    if (rawGroup) {
      const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
      if (group.communityId === params.communityId) { delete (group as any).communityId; await db.set(`group:${group.id}`, JSON.stringify(group)) }
    }
  }
  community.updatedAt = Date.now()
  await db.set(`community:${params.communityId}`, JSON.stringify(community))
  return Response.json({ success: true, community })
}
