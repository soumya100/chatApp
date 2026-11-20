import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

const typingValidator = z.object({
    chatId: z.string().min(1).max(256),
    isTyping: z.boolean().default(true)
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        const userId = session?.user?.id
        if (!userId) return new Response("Unauthorized", { status: 401 })

        let body: unknown
        try {
            body = await req.json()
        } catch {
            return new Response("Invalid request payload", { status: 400 })
        }
        const parsed = typingValidator.safeParse(body)
        if (!parsed.success) return new Response("Invalid request payload", { status: 422 })
        const { chatId, isTyping } = parsed.data

        if (chatId.startsWith("group--")) {
            const groupId = chatId.slice("group--".length)
            if (!groupId || !(await db.sismember(`group:${groupId}:members`, userId))) {
                return new Response("Forbidden", { status: 403 })
            }
        } else {
            const ids = chatId.split("--")
            if (ids.length !== 2 || !ids.includes(userId)) {
                return new Response("Forbidden", { status: 403 })
            }
            const friendId = ids[0] === userId ? ids[1] : ids[0]
            if (!(await db.sismember(`user:${userId}:friends`, friendId))) {
                return new Response("Forbidden", { status: 403 })
            }
        }

        await pusherServer.trigger(
            toPusherKey(`private-chat:${chatId}`),
            "user_typing",
            { userId, isTyping }
        )

        return new Response("OK")
    } catch (error) {
        console.error("[message/typing] Failed:", error)
        return new Response("Unable to update typing status", { status: 503 })
    }
}
