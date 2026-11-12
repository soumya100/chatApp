import { authOptions } from "@/lib/auth"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

const typingValidator = z.object({
    chatId: z.string(),
    isTyping: z.boolean().default(true)
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const body = await req.json()
        const { chatId, isTyping } = typingValidator.parse(body)

        const [userId1, userId2] = chatId.split('--')
        if (session.user.id !== userId1 && session.user.id !== userId2) {
            return new Response('Unauthorized', { status: 401 })
        }

        await pusherServer.trigger(
            toPusherKey(`private-chat:${chatId}`),
            'user_typing',
            {
                userId: session.user.id,
                isTyping
            }
        )

        return new Response('OK')
    } catch {
        return new Response('Bad request', { status: 400 })
    }
}

