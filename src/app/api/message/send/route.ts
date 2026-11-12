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
    mediaType: z.enum(['image', 'file', 'video', 'audio', 'video-note']).optional(),
    fileName: z.string().optional(),
    fileSize: z.number().optional(),
    duration: z.number().optional(),
    replyTo: z.object({
        id: z.string(),
        senderName: z.string(),
        text: z.string().optional(),
        mediaType: z.string().optional()
    }).optional()
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

        // Rate limit: max 15 messages per 10 seconds
        const { success: isAllowed } = await rateLimit(session.user.id, 'send_message', {
            limit: 15,
            windowSeconds: 10
        })
        if (!isAllowed) {
            return new Response('Too many messages sent. Please slow down.', {
                status: 429,
                headers: { 'Retry-After': '5' }
            })
        }

        const senderRaw = await fetchRedis('get', `user:${session.user.id}`) as string | User | null
        const parsedSender = (typeof senderRaw === 'string' ? JSON.parse(senderRaw) : senderRaw) as User
        const timeStamp = Date.now()

        // GROUP CHAT FLOW
        if (chatId.startsWith('group--')) {
            const groupId = chatId.replace('group--', '')
            const isMember = (await db.sismember(`group:${groupId}:members`, session.user.id)) as 0 | 1
            if (!isMember) {
                return new Response('Unauthorized: You are not a member of this group', { status: 403 })
            }

            const groupRaw = await db.get(`group:${groupId}`)
            const group = (typeof groupRaw === 'string' ? JSON.parse(groupRaw) : groupRaw) as Group

            const messageData = {
                id: nanoid(),
                receiverId: `group--${groupId}`,
                senderId: session.user.id,
                text,
                timestamp: timeStamp,
                mediaUrl: payload.mediaUrl,
                mediaType: payload.mediaType,
                fileName: payload.fileName,
                fileSize: payload.fileSize,
                duration: payload.duration,
                senderName: parsedSender?.name || 'Group Member',
                senderImg: parsedSender?.image,
                replyTo: payload.replyTo
            }

            const message = messageValidator.parse(messageData)

            // Persist message to group chat history
            await db.zadd(`chat:${chatId}:messages`, {
                score: timeStamp,
                member: JSON.stringify(message)
            })

            // Broadcast to private chat room channel
            await pusherServer.trigger(toPusherKey(`private-chat:${chatId}`), 'incoming-message', message)

            // Increment unread and notify each group member (except sender)
            const allMembers = (await db.smembers(`group:${groupId}:members`)) as string[]
            const recipientMembers = allMembers.filter((m) => m !== session.user.id)

            await Promise.all(
                recipientMembers.map((memberId) =>
                    Promise.all([
                        db.hincrby(`user:${memberId}:unread`, chatId, 1),
                        pusherServer.trigger(toPusherKey(`private-user:${memberId}:chats`), 'new_message', {
                            ...message,
                            senderName: `${parsedSender?.name || 'User'} (${group?.name || 'Group'})`,
                            senderImg: parsedSender?.image
                        })
                    ])
                )
            )

            return Response.json(message)
        }

        // 1-ON-1 DIRECT CHAT FLOW
        const ids = chatId.split('--')
        if (ids.length !== 2) {
            return new Response('Invalid chat ID', { status: 400 })
        }

        const [userId1, userId2] = ids
        if (session.user.id !== userId1 && session.user.id !== userId2) {
            return new Response('Unauthorized', { status: 401 })
        }

        const friendId = session.user.id === userId1 ? userId2 : userId1

        const friendList = (await fetchRedis('smembers', `user:${session.user.id}:friends`)) as string[]
        const isFriend = friendList.includes(friendId)

        if (!isFriend) {
            return new Response('Unauthorized', { status: 401 })
        }

        const messageData = {
            id: nanoid(),
            receiverId: friendId,
            senderId: session.user.id,
            text,
            timestamp: timeStamp,
            mediaUrl: payload.mediaUrl,
            mediaType: payload.mediaType,
            fileName: payload.fileName,
            fileSize: payload.fileSize,
            duration: payload.duration,
            senderName: parsedSender?.name || 'User',
            senderImg: parsedSender?.image,
            replyTo: payload.replyTo
        }

        const message = messageValidator.parse(messageData)

        // Persist message to database and increment recipient unread count
        await Promise.all([
            db.zadd(`chat:${chatId}:messages`, {
                score: timeStamp,
                member: JSON.stringify(message)
            }),
            db.hincrby(`user:${friendId}:unread`, chatId, 1)
        ])

        // Broadcast to private channels
        await Promise.all([
            pusherServer.trigger(toPusherKey(`private-chat:${chatId}`), 'incoming-message', message),
            pusherServer.trigger(toPusherKey(`private-user:${friendId}:chats`), 'new_message', {
                ...message,
                senderImg: parsedSender?.image,
                senderName: parsedSender?.name
            })
        ])

        return Response.json(message)
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
