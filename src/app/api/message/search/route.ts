import { authOptions } from "@/lib/auth"
import { hasCurrentChatAccess } from "@/lib/chat-access"
import { db } from "@/lib/db"
import { messageValidator } from "@/lib/validations/message"
import { getServerSession } from "next-auth"
import { rateLimit } from "@/lib/ratelimit"
import { z } from "zod"

const searchQueryValidator = z.object({
    chatId: z.string(),
    query: z.string().min(1).max(100).trim()
})

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const url = new URL(req.url)
        const params = Object.fromEntries(url.searchParams.entries())
        const { chatId, query } = searchQueryValidator.parse(params)

        if (!(await hasCurrentChatAccess(db, chatId, session.user.id))) return new Response("Forbidden", { status: 403 })
        const quota = await rateLimit(session.user.id, "message_search", { limit: 30, windowSeconds: 60 })
        if (!quota.success) return new Response("Too many searches. Please slow down.", { status: 429, headers: { "Retry-After": "60" } })

        // Bound work per request: search the most recent 500 records and return
        // at most 50 matches. Older history can be loaded through pagination.
        const rawMembers = (await db.zrange(`chat:${chatId}:messages`, -500, -1)) as unknown[]
        const results: Message[] = []
        const lowerQuery = query.toLowerCase()

        for (const raw of rawMembers) {
            const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw)
            try {
                const message = messageValidator.parse(JSON.parse(rawStr))
                if (!message.isDeleted && message.text.toLowerCase().includes(lowerQuery)) {
                    results.push(message)
                }
            } catch {
                continue
            }
        }

        const hasMore = results.length > 50
        return Response.json({ results: results.slice(0, 50), hasMore, scanned: rawMembers.length })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid search query', { status: 422 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}

