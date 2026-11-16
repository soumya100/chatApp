import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { nanoid } from "nanoid"
import { z } from "zod"

export const dynamic = "force-dynamic"

const addMembersSchema = z.object({
    groupId: z.string().min(1),
    memberIds: z.array(z.string().min(1)).min(1).max(100)
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 })

        const parsed = addMembersSchema.safeParse(await req.json())
        if (!parsed.success) {
            return Response.json({ message: parsed.error.errors[0]?.message || "Invalid payload" }, { status: 400 })
        }

        const { groupId, memberIds } = parsed.data
        const groupRaw = await db.get(`group:${groupId}`)
        if (!groupRaw) return Response.json({ message: "Group not found" }, { status: 404 })

        const group = (typeof groupRaw === "string" ? JSON.parse(groupRaw) : groupRaw) as Group
        const isMember = group.memberIds?.includes(session.user.id)
        if (!isMember) return Response.json({ message: "You are not a member of this group" }, { status: 403 })

        const isAdmin = (group.adminIds || [group.creatorId]).includes(session.user.id)
        if (group.settings?.onlyAdminsCanAddMembers && !isAdmin) {
            return Response.json({ message: "Only group admins can add members" }, { status: 403 })
        }

        const uniqueIds = Array.from(new Set(memberIds)).filter(id => !group.memberIds.includes(id))
        if (uniqueIds.length === 0) {
            return Response.json({ message: "Selected users are already group members" }, { status: 409 })
        }

        const usersPipeline = db.pipeline()
        uniqueIds.forEach(id => usersPipeline.get(`user:${id}`))
        const rawUsers = await usersPipeline.exec()
        const addedNames = rawUsers.flatMap(raw => {
            try {
                const user = (typeof raw === "string" ? JSON.parse(raw) : raw) as User
                return user?.name ? [user.name] : []
            } catch { return [] }
        })

        const updatedGroup: Group = {
            ...group,
            memberIds: [...group.memberIds, ...uniqueIds],
            updatedAt: Date.now()
        }
        const actorName = session.user.name || "A member"
        const systemMessage: Message = {
            id: nanoid(),
            senderId: "system",
            receiverId: `group--${groupId}`,
            text: `${actorName} added ${addedNames.length ? addedNames.join(", ") : `${uniqueIds.length} member(s)`} to the group`,
            timestamp: Date.now(),
            senderName: "System"
        }

        const pipeline = db.pipeline()
        uniqueIds.forEach(id => {
            pipeline.sadd(`group:${groupId}:members`, id)
            pipeline.sadd(`user:${id}:groups`, groupId)
        })
        pipeline.set(`group:${groupId}`, JSON.stringify(updatedGroup))
        pipeline.zadd(`chat:group--${groupId}:messages`, {
            score: systemMessage.timestamp,
            member: JSON.stringify(systemMessage)
        })
        await pipeline.exec()

        await Promise.all([
            ...uniqueIds.map(id => pusherServer.trigger(
                toPusherKey(`private-user:${id}:groups`), "new_group", updatedGroup
            )),
            pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "group_members_updated", {
                group: updatedGroup, addedMemberIds: uniqueIds
            }),
            pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "incoming-message", systemMessage)
        ])

        return Response.json({ success: true, group: updatedGroup, addedCount: uniqueIds.length })
    } catch (error) {
        console.error("Failed to add members to group:", error)
        return Response.json({ message: "Failed to add members to group" }, { status: 500 })
    }
}
