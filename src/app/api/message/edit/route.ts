import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

const editValidator = z.object({
    messageId: z.string(),
    chatId: z.string(),
    newText: z.string().min(1).max(2000).trim()
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const body = await req.json()
        const { messageId, chatId, newText } = editValidator.parse(body)

        const [userId1, userId2] = chatId.split('--')
        if (session.user.id !== userId1 && session.user.id !== userId2) {
            return new Response('Unauthorized', { status: 401 })
        }

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

        if (targetMessage.senderId !== session.user.id) {
            return new Response('Forbidden: You can only edit your own messages', { status: 403 })
        }

        if (targetMessage.isDeleted) {
            return new Response('Cannot edit a deleted message', { status: 400 })
        }

        const updatedMessage: Message = {
            ...targetMessage,
            text: newText,
            isEdited: true
        }

        await db.zrem(`chat:${chatId}:messages`, oldMemberString)
        await db.zadd(`chat:${chatId}:messages`, {
            score: targetMessage.timestamp,
            member: JSON.stringify(updatedMessage)
        })

        await pusherServer.trigger(
            toPusherKey(`private-chat:${chatId}`),
            'message_edited',
            { messageId, text: newText, isEdited: true }
        )

        return new Response('OK')
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', { status: 422 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}

