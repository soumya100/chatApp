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
    const preferencesPipeline = db.pipeline()
    memberIds.forEach(id => preferencesPipeline.get(`user:${id}:group-preferences:${groupId}`))
    const [rawUsers, rawPreferences] = await Promise.all([pipeline.exec(), preferencesPipeline.exec()])

    // Mirror the server-side privacy rule used by message broadcast/history:
    // a member who sets hideProfilePhoto in this group never exposes their photo.
    const hiddenPhotoIds = new Set<string>()
    rawPreferences.forEach((raw, index) => {
      try {
        const preferences = typeof raw === "string" ? JSON.parse(raw) : raw
        if (preferences?.hideProfilePhoto) hiddenPhotoIds.add(memberIds[index])
      } catch (error) {
        console.error(`Failed to load group preferences for member ${memberIds[index]} in group ${groupId}:`, error)
      }
    })

    const members = memberIds.map((id, index) => {
      let user: User | null = null
      try {
        const raw = rawUsers[index]
        user = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) as User : null
      } catch (error) {
        console.error(`Failed to load profile for group member ${id} in group ${groupId}:`, error)
      }
      return { id, name: user?.name || "Group member", image: hiddenPhotoIds.has(id) ? "" : user?.image || "" }
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
