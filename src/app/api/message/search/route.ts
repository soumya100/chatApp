import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { messageValidator } from "@/lib/validations/message"
import { getServerSession } from "next-auth"
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

        const [userId1, userId2] = chatId.split('--')
        if (session.user.id !== userId1 && session.user.id !== userId2) {
            return new Response('Unauthorized', { status: 401 })
        }

        const rawMembers = (await db.zrange(`chat:${chatId}:messages`, 0, -1)) as unknown[]
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

        return Response.json({ results })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid search query', { status: 422 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}

