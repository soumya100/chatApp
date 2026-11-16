import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schema = z.object({ messageId: z.string().min(1), pinned: z.boolean() })

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) return Response.json({ message: "Invalid pin request" }, { status: 400 })

    const groupId = params.groupId
    const rawGroup = await db.get(`group:${groupId}`)
    if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })
    const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
    if (!(group.memberIds || []).includes(userId)) return Response.json({ message: "Not a group member" }, { status: 403 })
    const isAdmin = (group.adminIds || [group.creatorId]).includes(userId)
    if (parsed.data.pinned && group.settings?.onlyAdminsCanPinMessages && !isAdmin) return Response.json({ message: "Only admins can pin messages" }, { status: 403 })

    const key = `chat:group--${groupId}:messages`
    const rows = (await db.zrange(key, 0, -1)) as unknown[]
    let target: Message | null = null
    for (const row of rows) {
      try {
        const item = (typeof row === "string" ? JSON.parse(row) : row) as Message
        if (item.id === parsed.data.messageId) { target = item; break }
      } catch {}
    }
    if (!target || target.senderId === "system" || target.isDeleted) return Response.json({ message: "Message cannot be pinned" }, { status: 404 })
    if (target.isPinned === parsed.data.pinned) return Response.json({ success: true, message: target })

    const updated = { ...target, isPinned: parsed.data.pinned, pinnedAt: parsed.data.pinned ? Date.now() : undefined, pinnedBy: parsed.data.pinned ? userId : undefined }
    await db.zrem(key, JSON.stringify(target))
    await db.zadd(key, { score: target.timestamp, member: JSON.stringify(updated) })
    await Promise.allSettled([pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "message_pin_updated", updated)])
    return Response.json({ success: true, message: updated })
  } catch (error) {
    console.error("Group pin action failed:", error)
    return Response.json({ message: "Unable to update pinned message" }, { status: 500 })
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
    const rows = await db.zrange(`chat:group--${params.groupId}:messages`, 0, -1) as unknown[]
    const messages: Message[] = []
    for (const row of rows) {
      try {
        const item = (typeof row === "string" ? JSON.parse(row) : row) as Message
        if (item.isPinned && !item.isDeleted && (!item.expiresAt || item.expiresAt > Date.now())) messages.push(item)
      } catch {}
    }
    messages.sort((a,b) => (b.pinnedAt || b.timestamp) - (a.pinnedAt || a.timestamp))
    return Response.json({ messages: messages.slice(0, 10) })
  } catch (error) {
    console.error("Pinned message read failed:", error)
    return Response.json({ message: "Unable to load pinned messages" }, { status: 500 })
  }
}
