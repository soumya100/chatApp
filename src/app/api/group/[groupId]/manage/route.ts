import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("update"),
        name: z.string().trim().min(2).max(50).optional(),
        description: z.string().trim().max(500).optional(),
        image: z.string().url().optional(),
        settings: z.object({
            onlyAdminsCanEditInfo: z.boolean().optional(),
            onlyAdminsCanAddMembers: z.boolean().optional(),
            onlyAdminsCanSendMessages: z.boolean().optional(),
            approvalRequired: z.boolean().optional()
        }).optional()
    }),
    z.object({ action: z.literal("promote"), memberId: z.string().min(1) }),
    z.object({ action: z.literal("demote"), memberId: z.string().min(1) }),
    z.object({ action: z.literal("remove"), memberId: z.string().min(1) }),
    z.object({ action: z.literal("leave") })
])

export async function POST(req: Request, { params }: { params: { groupId: string } }) {
    try {
        const session = await getServerSession(authOptions)
        const actorId = session?.user?.id
        if (!actorId) return Response.json({ message: "Unauthorized" }, { status: 401 })

        const parsed = schema.safeParse(await req.json())
        if (!parsed.success) {
            return Response.json({ message: parsed.error.errors[0]?.message || "Invalid request" }, { status: 400 })
        }

        const groupId = params.groupId
        const raw = await db.get(`group:${groupId}`)
        if (!raw) return Response.json({ message: "Group not found" }, { status: 404 })

        const group = (typeof raw === "string" ? JSON.parse(raw) : raw) as Group
        const memberIds = group.memberIds || []
        const adminIds = group.adminIds || [group.creatorId]
        const isMember = memberIds.includes(actorId)
        const isAdmin = adminIds.includes(actorId)
        if (!isMember) return Response.json({ message: "You are not a member of this group" }, { status: 403 })

        const action = parsed.data.action
        let updatedGroup: Group = { ...group }

        if (action === "update") {
            if (!isAdmin && group.settings?.onlyAdminsCanEditInfo) {
                return Response.json({ message: "Only admins can edit group information" }, { status: 403 })
            }
            const data = parsed.data
            updatedGroup = {
                ...group,
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.description !== undefined ? { description: data.description } : {}),
                ...(data.image !== undefined ? { image: data.image } : {}),
                settings: {
                    onlyAdminsCanEditInfo: false,
                    onlyAdminsCanAddMembers: false,
                    onlyAdminsCanSendMessages: false,
                    approvalRequired: false,
                    ...group.settings,
                    ...data.settings
                },
                updatedAt: Date.now()
            }
        } else if (action === "leave") {
            const remaining = memberIds.filter(id => id !== actorId)
            if (remaining.length === 0) {
                const pipeline = db.pipeline()
                pipeline.del(`group:${groupId}`, `group:${groupId}:members`, `chat:group--${groupId}:messages`)
                pipeline.srem(`user:${actorId}:groups`, groupId)
                await pipeline.exec()
                return Response.json({ success: true, deleted: true })
            }
            let nextAdmins = adminIds.filter(id => id !== actorId)
            if (actorId === group.creatorId || nextAdmins.length === 0) {
                const nextAdmin = remaining[0]
                nextAdmins = Array.from(new Set([...nextAdmins, nextAdmin]))
                updatedGroup.creatorId = nextAdmin
            }
            updatedGroup.memberIds = remaining
            updatedGroup.adminIds = nextAdmins
            updatedGroup.updatedAt = Date.now()
        } else {
            const targetId = parsed.data.memberId
            if (!memberIds.includes(targetId)) {
                return Response.json({ message: "Target user is not a group member" }, { status: 404 })
            }
            if (!isAdmin) return Response.json({ message: "Only admins can manage members" }, { status: 403 })
            if (action === "promote" || action === "demote") {
                if (actorId !== group.creatorId) {
                    return Response.json({ message: "Only the group creator can change admin roles" }, { status: 403 })
                }
                if (targetId === group.creatorId) {
                    return Response.json({ message: "The group creator must remain an admin" }, { status: 400 })
                }
                const nextAdmins = new Set(adminIds)
                if (action === "promote") nextAdmins.add(targetId)
                else nextAdmins.delete(targetId)
                updatedGroup.adminIds = Array.from(nextAdmins)
            } else {
                if (targetId === group.creatorId) {
                    return Response.json({ message: "Transfer group ownership before removing the creator" }, { status: 400 })
                }
                updatedGroup.memberIds = memberIds.filter(id => id !== targetId)
                updatedGroup.adminIds = adminIds.filter(id => id !== targetId)
            }
            updatedGroup.updatedAt = Date.now()
        }

        const removedIds: string[] = action === "leave"
            ? [actorId]
            : action === "remove" && "memberId" in parsed.data ? [parsed.data.memberId] : []

        const pipeline = db.pipeline()
        pipeline.set(`group:${groupId}`, JSON.stringify(updatedGroup))
        for (const id of removedIds) {
            pipeline.srem(`group:${groupId}:members`, id)
            pipeline.srem(`user:${id}:groups`, groupId)
        }
        if (action === "leave" || action === "remove") {
            const systemMessage: Message = {
                id: `group-event-${Date.now()}`,
                senderId: "system",
                receiverId: `group--${groupId}`,
                text: action === "leave"
                    ? `${session.user.name || "A member"} left the group`
                    : `${session.user.name || "An admin"} removed a member`,
                timestamp: Date.now(),
                senderName: "System"
            }
            pipeline.zadd(`chat:group--${groupId}:messages`, {
                score: systemMessage.timestamp,
                member: JSON.stringify(systemMessage)
            })
        }
        await pipeline.exec()

        await Promise.all([
            pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "group_updated", updatedGroup),
            ...removedIds.map(id => pusherServer.trigger(
                toPusherKey(`private-user:${id}:groups`), "group_removed", { groupId }
            )),
            ...updatedGroup.memberIds.map(id => pusherServer.trigger(
                toPusherKey(`private-user:${id}:groups`), "group_updated", updatedGroup
            ))
        ])

        return Response.json({ success: true, group: updatedGroup, removed: removedIds })
    } catch (error) {
        console.error("Group management error:", error)
        return Response.json({ message: "Failed to update group" }, { status: 500 })
    }
}
