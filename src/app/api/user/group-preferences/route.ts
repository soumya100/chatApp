import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"
const schema = z.object({
  groupId: z.string().min(1),
  notifications: z.enum(["all", "mentions", "muted"]).optional(),
  showReadReceipts: z.boolean().optional(),
  allowDirectMessages: z.boolean().optional(),
  hideProfilePhoto: z.boolean().optional()
}).refine(value => Object.keys(value).some(key => key !== "groupId"), "At least one preference is required")

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const groupId = new URL(req.url).searchParams.get("groupId")
  if (!groupId) return Response.json({ message: "groupId is required" }, { status: 400 })
  const rawGroup = await db.get(`group:${groupId}`)
  if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
  const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
  if (!(group.memberIds || []).includes(userId)) return Response.json({ message: "Not a group member" }, { status: 403 })
  const raw = await db.get(`user:${userId}:group-preferences:${groupId}`)
  return Response.json({ preferences: (typeof raw === "string" ? JSON.parse(raw) : raw) || { notifications: "all", showReadReceipts: true, allowDirectMessages: true, hideProfilePhoto: false } })
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ message: "Invalid preference payload" }, { status: 400 })
  const { groupId, ...changes } = parsed.data
  const rawGroup = await db.get(`group:${groupId}`)
  if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
  const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
  if (!(group.memberIds || []).includes(userId)) return Response.json({ message: "Not a group member" }, { status: 403 })
  const key = `user:${userId}:group-preferences:${groupId}`
  const raw = await db.get(key)
  const current = (typeof raw === "string" ? JSON.parse(raw) : raw) || { notifications: "all", showReadReceipts: true, allowDirectMessages: true, hideProfilePhoto: false }
  const preferences = { ...current, ...changes, updatedAt: Date.now() }
  await db.set(key, JSON.stringify(preferences))
  return Response.json({ success: true, preferences })
}
