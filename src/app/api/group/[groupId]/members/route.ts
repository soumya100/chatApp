import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return Response.json({ message: "Unauthorized" }, { status: 401 })

    const { groupId } = await params
    const rawGroup = await db.get(`group:${groupId}`)
    if (!rawGroup) return Response.json({ message: "Group not found" }, { status: 404 })

    const group = (typeof rawGroup === "string" ? JSON.parse(rawGroup) : rawGroup) as Group
    if (!(group.memberIds || []).includes(userId)) {
      return Response.json({ message: "You are not a member of this group" }, { status: 403 })
    }

    const memberIds = Array.from(new Set(group.memberIds || []))
    const pipeline = db.pipeline()
    memberIds.forEach(id => pipeline.get(`user:${id}`))
    const rawUsers = await pipeline.exec()

    const members = memberIds.map((id, index) => {
      try {
        const raw = rawUsers[index]
        const user = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) as User : null
        return { id, name: user?.name || "Group member", image: user?.image || "" }
      } catch {
        return { id, name: "Group member", image: "" }
      }
    })

    return Response.json({
      members,
      creatorId: group.creatorId,
      adminIds: group.adminIds?.length ? group.adminIds : [group.creatorId],
      memberCount: members.length
    })
  } catch (error) {
    console.error("Group members read failed:", error)
    return Response.json({ message: "Unable to load group members" }, { status: 500 })
  }
}
