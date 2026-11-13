import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { generateInitialsAvatar } from "@/lib/avatars"
import { getServerSession } from "next-auth"
import { nanoid } from "nanoid"
import { z } from "zod"

const createGroupSchema = z.object({
    name: z.string().min(2, "Group name must be at least 2 characters").max(50),
    memberIds: z.array(z.string()).default([]),
    image: z.string().optional()
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
        }

        const body = await req.json()
        const parseResult = createGroupSchema.safeParse(body)
        if (!parseResult.success) {
            return new Response(
                JSON.stringify({ message: parseResult.error.errors[0]?.message || "Invalid group payload" }),
                { status: 400 }
            )
        }

        const { name, memberIds, image } = parseResult.data

        const groupId = nanoid(10)
        const allMemberIds = Array.from(new Set([session.user.id, ...memberIds]))
        const groupAvatar = image || generateInitialsAvatar(name, '#8b5cf6', '#ec4899')

        const newGroup: Group = {
            id: groupId,
            name: name.trim(),
            creatorId: session.user.id,
            memberIds: allMemberIds,
            image: groupAvatar,
            createdAt: Date.now()
        }

        // Persist group in Redis
        const pipeline = db.pipeline()
        pipeline.set(`group:${groupId}`, JSON.stringify(newGroup))

        for (const memberId of allMemberIds) {
            pipeline.sadd(`group:${groupId}:members`, memberId)
            pipeline.sadd(`user:${memberId}:groups`, groupId)
        }

        await pipeline.exec()

        // Real-time broadcast to each member's private channel
        await Promise.all(
            allMemberIds.map((memberId) =>
                pusherServer.trigger(
                    toPusherKey(`private-user:${memberId}:groups`),
                    'new_group',
                    newGroup
                )
            )
        )

        return new Response(JSON.stringify({ success: true, group: newGroup }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error("Create group error:", error)
        return new Response(JSON.stringify({ message: "Failed to create group" }), { status: 500 })
    }
}

