import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { messageValidator } from "@/lib/validations/message"
import { getServerSession } from "next-auth"
import { z } from "zod"

const historyQueryValidator = z.object({
    chatId: z.string(),
    cursor: z.coerce.number().optional(),
    limit: z.coerce.number().min(1).max(50).default(30)
})

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const url = new URL(req.url)
        const params = Object.fromEntries(url.searchParams.entries())
        const { chatId, cursor, limit } = historyQueryValidator.parse(params)

        const [userId1, userId2] = chatId.split('--')
        if (session.user.id !== userId1 && session.user.id !== userId2) {
            return new Response('Unauthorized', { status: 401 })
        }

        const friendId = session.user.id === userId1 ? userId2 : userId1
        const isFriend = (await db.sismember(`user:${session.user.id}:friends`, friendId)) as 0 | 1
        if (!isFriend) {
            return new Response('Unauthorized', { status: 401 })
        }

        let rawMessages: unknown[] = []

        if (cursor) {
            // Fetch older messages strictly before cursor timestamp (newest of the old first)
            rawMessages = await db.zrange(
                `chat:${chatId}:messages`,
                `(${cursor}` as `(${number}`,
                '-inf',
                { byScore: true, rev: true, offset: 0, count: limit }
            )
        } else {
            // Initial fetch of latest messages: get slice from end, then reverse
            const latestSlice = (await db.zrange(`chat:${chatId}:messages`, -limit, -1)) as unknown[]
            rawMessages = [...latestSlice].reverse()
        }

        const messages: Message[] = []
        for (const raw of rawMessages) {
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
                const validated = messageValidator.parse(parsed)
                messages.push(validated)
            } catch {
                // skip corrupted message
            }
        }

        const hasMore = messages.length === limit

        return Response.json({
            messages,
            hasMore,
            nextCursor: messages.length > 0 ? messages[messages.length - 1].timestamp : null
        })

    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid query parameters', { status: 422 })
        }
        return new Response('Internal Server Error', { status: 500 })
    }
}

