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

 
async function isValidReplyTarget(chatId: string, replyTo?: { id: string }) {
    if (!replyTo) return true

    const rawMessages = (await db.zrange(`chat:${chatId}:messages`, 0, -1)) as unknown[]
    for (const raw of rawMessages) {
        try {
            const message = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Message
            if (message.id === replyTo.id) {
                return message.senderId !== 'system' && !message.isDeleted
            }
        } catch {
            continue
        }
    }
    return false
}

export async function POST(req: Request) {
    let operation = 'parse request'
    try {
        const body = await req.json()
        const payload = sendMessagePayloadValidator.parse(body)
        const { text, chatId } = payload

        operation = 'authenticate sender'
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        // Rate limit: max 15 messages per 10 seconds
        operation = 'rate limit'
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

        operation = 'load sender profile'
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
            if (!groupRaw) return new Response('Group not found', { status: 404 })
            const group = (typeof groupRaw === 'string' ? JSON.parse(groupRaw) : groupRaw) as Group
            const isAdmin = (group.adminIds || [group.creatorId]).includes(session.user.id)
            if ((group.settings?.onlyAdminsCanSendMessages || group.settings?.announcementsOnly) && !isAdmin) {
                return new Response('Only group admins can send messages', { status: 403 })
            }
            const rawSenderPreferences = await db.get(`user:${session.user.id}:group-preferences:${groupId}`)
            const senderPreferences = (typeof rawSenderPreferences === 'string' ? JSON.parse(rawSenderPreferences) : rawSenderPreferences) || {}
            if (!(await isValidReplyTarget(chatId, payload.replyTo))) {
                return new Response('Cannot reply to a deleted or system-generated message', { status: 400 })
            }

            const messageData = {
                id: nanoid(),
                receiverId: `group--${groupId}`,
                senderId: session.user.id,
                text,
                timestamp: timeStamp,
                expiresAt: group.settings?.disappearingMessagesSeconds ? timeStamp + group.settings.disappearingMessagesSeconds * 1000 : undefined,
                mediaUrl: payload.mediaUrl,
                mediaType: payload.mediaType,
                fileName: payload.fileName,
                fileSize: payload.fileSize,
                duration: payload.duration,
                senderName: parsedSender?.name || 'Group Member',
                senderImg: senderPreferences.hideProfilePhoto ? undefined : parsedSender?.image,
                replyTo: payload.replyTo
            }

            const message = messageValidator.parse(messageData)

            // Persist message to group chat history
            operation = 'persist group message'
            await db.zadd(`chat:${chatId}:messages`, {
                score: timeStamp,
                member: JSON.stringify(message)
            })

            // Broadcast after persistence. Pusher payloads must stay small: profile images
            // may be stored as data URLs and exceed Pusher's event-size limit.
            operation = 'broadcast group message'
            const pusherMessage = { ...message, senderImg: senderPreferences.hideProfilePhoto || message.senderImg?.startsWith('data:') || (message.senderImg?.length || 0) > 2048 ? undefined : message.senderImg }
            const broadcastResults = await Promise.allSettled([
                pusherServer.trigger(toPusherKey(`private-chat:${chatId}`), 'incoming-message', pusherMessage)
            ])
            broadcastResults.forEach(result => { if (result.status === 'rejected') console.error('Pusher group message broadcast failed:', result.reason) })

            // Increment unread and notify each group member (except sender)
            const allMembers = (await db.smembers(`group:${groupId}:members`)) as string[]
            const recipientMembers = allMembers.filter((m) => m !== session.user.id)

            operation = 'update group unread counts and notifications'
            await Promise.all(recipientMembers.map(async (memberId) => {
                await db.hincrby(`user:${memberId}:unread`, chatId, 1)
                const rawPreferences = await db.get(`user:${memberId}:group-preferences:${groupId}`)
                const preferences = (typeof rawPreferences === 'string' ? JSON.parse(rawPreferences) : rawPreferences) || {}
                if (preferences.notifications === 'muted') return
                try {
                    await pusherServer.trigger(toPusherKey(`private-user:${memberId}:chats`), 'new_message', {
                        ...pusherMessage,
                        senderName: `${parsedSender?.name || 'User'} (${group?.name || 'Group'})`
                    })
                } catch (error) {
                    console.error('Pusher group notification failed:', error)
                }
            }))

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
        if (!(await isValidReplyTarget(chatId, payload.replyTo))) {
            return new Response('Cannot reply to a deleted or system-generated message', { status: 400 })
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

        // Persist message to Redis before attempting realtime delivery.
        operation = 'persist direct message and unread count'
        await Promise.all([
            db.zadd(`chat:${chatId}:messages`, {
                score: timeStamp,
                member: JSON.stringify(message)
            }),
            db.hincrby(`user:${friendId}:unread`, chatId, 1)
        ])

        // Realtime delivery is best-effort: Pusher can reject oversized events (413).
        // A Pusher failure must not make an already-persisted message look unsent.
        operation = 'broadcast direct message'
        const pusherMessage = {
            ...message,
            senderImg: parsedSender?.image?.startsWith('data:') || (parsedSender?.image?.length || 0) > 2048 ? undefined : parsedSender?.image
        }
        const broadcastResults = await Promise.allSettled([
            pusherServer.trigger(toPusherKey(`private-chat:${chatId}`), 'incoming-message', pusherMessage),
            pusherServer.trigger(toPusherKey(`private-user:${friendId}:chats`), 'new_message', {
                ...pusherMessage,
                senderName: parsedSender?.name
            })
        ])
        broadcastResults.forEach(result => { if (result.status === 'rejected') console.error('Pusher direct message broadcast failed:', result.reason) })

        return Response.json(message)
    } catch (error) {
        console.error(`[message/send] Failed during ${operation}:`, error)
        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', { status: 422 })
        }
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}
