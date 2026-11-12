import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { nanoid } from "nanoid"
import { z } from "zod"

export const dynamic = 'force-dynamic'

const addMembersSchema = z.object({
    groupId: z.string().min(1, "Group ID is required"),
    memberIds: z.array(z.string()).min(1, "Select at least one friend to add")
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
        }

        const body = await req.json()
        const parseResult = addMembersSchema.safeParse(body)
        if (!parseResult.success) {
            return new Response(
                JSON.stringify({ message: parseResult.error.errors[0]?.message || "Invalid payload" }),
                { status: 400 }
            )
        }

        const { groupId, memberIds } = parseResult.data

        // Verify current user is an existing member of the group
        const isMember = (await db.sismember(`group:${groupId}:members`, session.user.id)) as 0 | 1
        if (!isMember) {
            return new Response(
                JSON.stringify({ message: "Forbidden: You are not a member of this group" }),
                { status: 403 }
            )
        }

        // Fetch existing group record
        const groupRaw = await db.get(`group:${groupId}`)
        if (!groupRaw) {
            return new Response(JSON.stringify({ message: "Group not found" }), { status: 404 })
        }

        const group = (typeof groupRaw === 'string' ? JSON.parse(groupRaw) : groupRaw) as Group
        const existingMemberSet = new Set(group.memberIds || [])

        // Filter for members not already in the group
        const newMembersToAdd = memberIds.filter((id) => !existingMemberSet.has(id))
        if (newMembersToAdd.length === 0) {
            return new Response(
                JSON.stringify({ message: "Selected friends are already in this group" }),
                { status: 400 }
            )
        }

        // Fetch added friends' profiles for announcement message
        const addedUsersPipeline = db.pipeline()
        for (const uid of newMembersToAdd) {
            addedUsersPipeline.get(`user:${uid}`)
        }
        const rawAddedUsers = await addedUsersPipeline.exec()
        const addedNames: string[] = []
        for (const raw of rawAddedUsers) {
            if (!raw) continue
            try {
                const u = (typeof raw === 'string' ? JSON.parse(raw) : raw) as User
                if (u?.name) addedNames.push(u.name)
            } catch {}
        }

        const updatedMemberIds = Array.from(new Set([...group.memberIds, ...newMembersToAdd]))
        const updatedGroup: Group = {
            ...group,
            memberIds: updatedMemberIds
        }

        // Persist to Redis
        const pipeline = db.pipeline()
        pipeline.sadd(`group:${groupId}:members`, ...newMembersToAdd)
        for (const uid of newMembersToAdd) {
            pipeline.sadd(`user:${uid}:groups`, groupId)
        }
        pipeline.set(`group:${groupId}`, JSON.stringify(updatedGroup))

        // System notification message
        const actorName = session.user.name || "A member"
        const namesFormatted = addedNames.length > 0 ? addedNames.join(", ") : `${newMembersToAdd.length} friends`
        const systemMessage: Message = {
            id: nanoid(),
            senderId: 'system',
            receiverId: `group--${groupId}`,
            text: `${actorName} added ${namesFormatted} to the group`,
            timestamp: Date.now(),
            senderName: 'System'
        }

        pipeline.zadd(`chat:group--${groupId}:messages`, {
            score: systemMessage.timestamp,
            member: JSON.stringify(systemMessage)
        })

        await pipeline.exec()

        // Real-time Pusher updates:
        // 1. Notify newly added members so the group appears in their sidebar
        await Promise.all(
            newMembersToAdd.map((uid) =>
                pusherServer.trigger(toPusherKey(`private-user:${uid}:groups`), 'new_group', updatedGroup)
            )
        )

        // 2. Broadcast updated member count and list to active chat room
        const chatChannelKey = toPusherKey(`private-chat:group--${groupId}`)
        await Promise.all([
            pusherServer.trigger(chatChannelKey, 'group_members_updated', {
                group: updatedGroup,
                addedMemberIds: newMembersToAdd
            }),
            pusherServer.trigger(chatChannelKey, 'incoming-message', systemMessage)
        ])

        return Response.json({
            success: true,
            group: updatedGroup,
            addedCount: newMembersToAdd.length
        })
    } catch (error: any) {
        console.error("Failed to add members to group:", error)
        return new Response(
            JSON.stringify({ message: error?.message || "Failed to add members to group" }),
            { status: 500 }
        )
    }
}

