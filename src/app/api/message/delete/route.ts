import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

const deleteValidator = z.object({
    messageId: z.string(),
    chatId: z.string()
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const body = await req.json()
        const { messageId, chatId } = deleteValidator.parse(body)

        if (chatId.startsWith('group--')) {
            const groupId = chatId.replace('group--', '')
            const isMember = (await db.sismember(`group:${groupId}:members`, session.user.id)) as 0 | 1
            if (!isMember) {
                return new Response('Unauthorized: You are not a member of this group', { status: 403 })
            }
        } else {
            const [userId1, userId2] = chatId.split('--')
            if (session.user.id !== userId1 && session.user.id !== userId2) {
                return new Response('Unauthorized', { status: 401 })
            }
        }

        // Fetch recent messages to locate the target message
        const rawMembers = (await db.zrange(`chat:${chatId}:messages`, 0, -1)) as unknown[]
        let oldMemberString: string | null = null
        let targetMessage: Message | null = null

        for (const raw of rawMembers) {
            const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw)
            try {
                const parsed = JSON.parse(rawStr) as Message
                if (parsed.id === messageId) {
                    oldMemberString = rawStr
                    targetMessage = parsed
                    break
                }
            } catch {
                continue
            }
        }

        if (!targetMessage || !oldMemberString) {
            return new Response('Message not found', { status: 404 })
        }

        // Only sender can delete their message
        if (targetMessage.senderId !== session.user.id) {
            return new Response('Forbidden: You can only delete your own messages', { status: 403 })
        }

        const updatedMessage: Message = {
            ...targetMessage,
            text: 'This message was deleted',
            isDeleted: true
        }

        // Atomic swap in Redis sorted set
        await db.zrem(`chat:${chatId}:messages`, oldMemberString)
        await db.zadd(`chat:${chatId}:messages`, {
            score: targetMessage.timestamp,
            member: JSON.stringify(updatedMessage)
        })

        // Broadcast deletion event to connected chat room clients
        await pusherServer.trigger(
            toPusherKey(`private-chat:${chatId}`),
            'message_deleted',
            { messageId }
        )

        return new Response('OK')
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', { status: 422 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}

