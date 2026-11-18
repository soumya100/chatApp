import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { groupPreferencesKey, groupPreferencesOrDefault } from "@/lib/group-preferences"
import { getServerSession } from "next-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"
const schema = z.object({
  groupId: z.string().min(1),
  notifications: z.enum(["all", "muted"]).optional(),
  showReadReceipts: z.boolean().optional(),
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
  const raw = await db.get(groupPreferencesKey(userId, groupId))
  // A corrupt stored record falls back to defaults instead of failing the read;
  // the next successful PUT overwrites it through the same normalizer.
  const preferences = groupPreferencesOrDefault(raw)
  return Response.json({ preferences })
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ message: "Request body must be valid JSON" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ message: "Invalid preference payload" }, { status: 400 })
  const { groupId, ...changes } = parsed.data
  const rawGroup = await db.get(`group:${groupId}`)
  if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
  const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
  if (!(group.memberIds || []).includes(userId)) return Response.json({ message: "Not a group member" }, { status: 403 })
  const key = groupPreferencesKey(userId, groupId)
  const current = groupPreferencesOrDefault(await db.get(key))
  const preferences = { ...current, ...changes, updatedAt: Date.now() }
  await db.set(key, JSON.stringify(preferences))
  return Response.json({ success: true, preferences })
}
