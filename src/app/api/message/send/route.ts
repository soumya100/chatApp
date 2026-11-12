import { fetchRedis } from "@/helpers/redis"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { nanoid } from 'nanoid'
import { messageValidator } from "@/lib/validations/message"
import { toPusherKey } from "@/lib/utils"
import { pusherServer } from "@/lib/pusher"
import { rateLimit } from "@/lib/ratelimit"
import { z } from "zod"

const sendMessagePayloadValidator = z.object({
    text: z.string().max(2000).default(''),
    chatId: z.string(),
    mediaUrl: z.string().optional(),
    mediaType: z.enum(['image', 'file']).optional(),
    fileName: z.string().optional(),
    fileSize: z.number().optional()
}).refine(data => data.text.trim().length > 0 || Boolean(data.mediaUrl), {
    message: 'Message must contain either text or an attachment'
})

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const payload = sendMessagePayloadValidator.parse(body)
        const { text, chatId } = payload

        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        // Rate limit: max 10 messages per 10 seconds
        const { success: isAllowed } = await rateLimit(session.user.id, 'send_message', {
            limit: 10,
            windowSeconds: 10
        })
        if (!isAllowed) {
            return new Response('Too many messages sent. Please slow down.', {
                status: 429,
                headers: { 'Retry-After': '5' }
            })
        }

        const ids = chatId.split('--')
        if (ids.length !== 2) {
            return new Response('Invalid chat ID', { status: 400 })
        }

        const [userId1, userId2] = ids
        if (session.user.id !== userId1 && session.user.id !== userId2) {
            return new Response('Unauthorized', { status: 401 })
        }

        const friendId = session.user.id === userId1 ? userId2 : userId1

        const friendList = await fetchRedis('smembers', `user:${session.user.id}:friends`) as string[]
        const isFriend = friendList.includes(friendId)

        if (!isFriend) {
            return new Response('Unauthorized', { status: 401 })
        }

        const sender = await fetchRedis('get', `user:${session.user.id}`) as string
        const parsedSender = JSON.parse(sender) as User

        const timeStamp = Date.now()
        const messageData = {
            id: nanoid(),
            receiverId: friendId,
            senderId: session.user.id,
            text,
            timestamp: timeStamp,
            mediaUrl: payload.mediaUrl,
            mediaType: payload.mediaType,
            fileName: payload.fileName,
            fileSize: payload.fileSize
        }

        const message = messageValidator.parse(messageData)

        // 1. Persist message to database and increment recipient unread count FIRST
        await Promise.all([
            db.zadd(`chat:${chatId}:messages`, {
                score: timeStamp,
                member: JSON.stringify(message)
            }),
            db.hincrby(`user:${friendId}:unread`, chatId, 1)
        ])

        // 2. Broadcast to private channels ONLY AFTER successful persistence
        await Promise.all([
            pusherServer.trigger(toPusherKey(`private-chat:${chatId}`), 'incoming-message', message),
            pusherServer.trigger(toPusherKey(`private-user:${friendId}:chats`), 'new_message', {
                ...message,
                senderImg: parsedSender.image,
                senderName: parsedSender.name
            })
        ])

        return new Response('OK')
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', { status: 422 })
        }
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}