import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { nanoid } from "nanoid"
import { z } from "zod"

export const dynamic = "force-dynamic"

const createSchema = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(500).optional(), groupIds: z.array(z.string().min(1)).max(50).default([]) })

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const ids = await db.smembers(`user:${userId}:communities`) as string[]
  if (!ids?.length) return Response.json({ communities: [] })
  const pipeline = db.pipeline()
  ids.forEach(id => pipeline.get(`community:${id}`))
  const rows = await pipeline.exec()
  const communities = rows.flatMap(raw => {
    try { const value = typeof raw === "string" ? JSON.parse(raw) : raw; return value ? [value] : [] } catch { return [] }
  })
  return Response.json({ communities })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ message: parsed.error.errors[0]?.message || "Invalid community" }, { status: 400 })
  const { name, description, groupIds } = parsed.data
  const groups: Group[] = []
  for (const id of groupIds) {
    const raw = await db.get(`group:${id}`)
    if (!raw) return Response.json({ message: `Group ${id} not found` }, { status: 404 })
    const group = (typeof raw === "string" ? JSON.parse(raw) : raw) as Group
    if (!(group.adminIds || [group.creatorId]).includes(userId)) return Response.json({ message: "Only admins of every selected group can add it to a community" }, { status: 403 })
    groups.push(group)
  }
  const id = nanoid()
  const community = { id, name, description: description || "", ownerId: userId, adminIds: [userId], memberIds: [userId], groupIds, createdAt: Date.now(), updatedAt: Date.now() }
  const pipeline = db.pipeline()
  pipeline.set(`community:${id}`, JSON.stringify(community))
  pipeline.sadd(`user:${userId}:communities`, id)
  for (const group of groups) {
    pipeline.set(`group:${group.id}`, JSON.stringify({ ...group, communityId: id, updatedAt: Date.now() }))
  }
  await pipeline.exec()
  return Response.json({ success: true, community }, { status: 201 })
}
