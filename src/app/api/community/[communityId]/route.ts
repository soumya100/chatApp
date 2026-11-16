import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), name: z.string().trim().min(2).max(60).optional(), description: z.string().max(500).optional() }),
  z.object({ action: z.literal("addGroup"), groupId: z.string().min(1) }),
  z.object({ action: z.literal("removeGroup"), groupId: z.string().min(1) }),
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
  const action = parsed.data.action
  if (action !== "leave" && !(community.adminIds || [community.ownerId]).includes(userId)) return Response.json({ message: "Only community admins can manage it" }, { status: 403 })
  if (action === "leave") {
    community.memberIds = community.memberIds.filter((id: string) => id !== userId)
    await db.srem(`user:${userId}:communities`, params.communityId)
  } else if (action === "update") {
    if (parsed.data.name !== undefined) community.name = parsed.data.name
    if (parsed.data.description !== undefined) community.description = parsed.data.description
  } else if (action === "addGroup") {
    const rawGroup = await db.get(`group:${parsed.data.groupId}`)
    if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
    const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
    if (!(group.adminIds || [group.creatorId]).includes(userId)) return Response.json({ message: "You must administer the group" }, { status: 403 })
    community.groupIds = Array.from(new Set([...(community.groupIds || []), group.id]))
    await db.set(`group:${group.id}`, JSON.stringify({ ...group, communityId: params.communityId, updatedAt: Date.now() }))
  } else if (action === "removeGroup") {
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
