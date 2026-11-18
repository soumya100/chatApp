import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { groupPreferencesKey, parseStoredGroupPreferences } from "@/lib/group-preferences"
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
    memberIds.forEach(id => preferencesPipeline.get(groupPreferencesKey(id, groupId)))
    const [rawUsers, rawPreferences] = await Promise.all([pipeline.exec(), preferencesPipeline.exec()])

    // Mirror the server-side privacy rule used by message broadcast/history:
    // a member who sets hideProfilePhoto in this group never exposes their photo.
    // The rule fails closed: when a member's preference record cannot be decoded
    // we cannot prove they opted into being visible, so their photo is hidden.
    const hiddenPhotoIds = new Set<string>()
    let unreadablePreferences = 0
    rawPreferences.forEach((raw, index) => {
      const memberId = memberIds[index]
      const stored = parseStoredGroupPreferences(raw)
      if (stored.status === "corrupt") {
        unreadablePreferences += 1
        hiddenPhotoIds.add(memberId)
        return
      }
      if (stored.preferences.hideProfilePhoto) hiddenPhotoIds.add(memberId)
    })

    let unreadableProfiles = 0
    const members = memberIds.map((id, index) => {
      const raw = rawUsers[index]
      let user: User | null = null
      if (raw != null) {
        try {
          user = (typeof raw === "string" ? JSON.parse(raw) : raw) as User
        } catch {
          unreadableProfiles += 1
        }
      }
      return { id, name: user?.name || "Group member", image: hiddenPhotoIds.has(id) ? "" : user?.image || "" }
    })

    // Degraded records are counted and surfaced to the caller and the logs.
    // Log lines carry counts only — never member or group identifiers.
    if (unreadablePreferences || unreadableProfiles) {
      console.error(
        `Group member directory degraded: ${unreadablePreferences} preference record(s) and ` +
        `${unreadableProfiles} profile record(s) could not be decoded; affected photos are hidden.`
      )
    }

    return Response.json({
      members,
      creatorId: group.creatorId,
      adminIds: group.adminIds?.length ? group.adminIds : [group.creatorId],
      memberCount: members.length,
      degraded: {
        unreadablePreferences,
        unreadableProfiles
      }
    })
  } catch (error) {
    console.error("Group members read failed:", error)
    return Response.json({ message: "Unable to load group members" }, { status: 500 })
  }
}
