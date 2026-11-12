import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

const reactValidator = z.object({
    messageId: z.string(),
    chatId: z.string(),
    emoji: z.string().min(1).max(8)
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const body = await req.json()
        const { messageId, chatId, emoji } = reactValidator.parse(body)

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

        if (targetMessage.isDeleted) {
            return new Response('Cannot react to a deleted message', { status: 400 })
        }

        const currentReactions = { ...(targetMessage.reactions || {}) }
        const usersForEmoji = [...(currentReactions[emoji] || [])]
        const hasReacted = usersForEmoji.includes(session.user.id)

        if (hasReacted) {
            // Toggle off reaction
            const updatedUsers = usersForEmoji.filter((id) => id !== session.user.id)
            if (updatedUsers.length > 0) {
                currentReactions[emoji] = updatedUsers
            } else {
                delete currentReactions[emoji]
            }
        } else {
            // Toggle on reaction
            usersForEmoji.push(session.user.id)
            currentReactions[emoji] = usersForEmoji
        }

        const updatedMessage: Message = {
            ...targetMessage,
            reactions: currentReactions
        }

        await db.zrem(`chat:${chatId}:messages`, oldMemberString)
        await db.zadd(`chat:${chatId}:messages`, {
            score: targetMessage.timestamp,
            member: JSON.stringify(updatedMessage)
        })

        await pusherServer.trigger(
            toPusherKey(`private-chat:${chatId}`),
            'message_reacted',
            { messageId, reactions: currentReactions }
        )

        return Response.json({ reactions: currentReactions })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', { status: 422 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}

