import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { z } from "zod"

const readPayloadValidator = z.object({
    chatId: z.string()
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const body = await req.json()
        const { chatId } = readPayloadValidator.parse(body)

        // Clear the unread count for this chat for the authenticated user
        await db.hdel(`user:${session.user.id}:unread`, chatId)

        return new Response('OK')
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', { status: 422 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}

