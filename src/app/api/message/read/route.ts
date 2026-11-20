import { authOptions } from "@/lib/auth"
import { hasCurrentChatAccess } from "@/lib/chat-access"
import { db } from "@/lib/db"
import { groupPreferencesKey, groupPreferencesOrDefault } from "@/lib/group-preferences"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

const readPayloadValidator = z.object({
    chatId: z.string().min(1).max(256)
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        let body: unknown
        try {
            body = await req.json()
        } catch {
            return new Response('Invalid request payload', { status: 400 })
        }
        const { chatId } = readPayloadValidator.parse(body)

        if (!(await hasCurrentChatAccess(db, chatId, session.user.id))) return new Response('Forbidden', { status: 403 })
        await db.hdel(`user:${session.user.id}:unread`, chatId)

        // A group read receipt is visible only when the reader has opted in.
        if (chatId.startsWith('group--')) {
            const groupId = chatId.slice('group--'.length)
            const rawPreferences = await db.get(groupPreferencesKey(session.user.id, groupId))
            const preferences = groupPreferencesOrDefault(rawPreferences)
            if (preferences.showReadReceipts === false) return new Response('OK')
        }

        // Clearing unread state is the durable operation. Realtime read-receipt
        // delivery is best-effort: a Pusher outage must not make a successful
        // read appear to have failed and encourage unsafe client retries.
        const broadcast = await Promise.allSettled([
            pusherServer.trigger(toPusherKey(`private-chat:${chatId}`), 'messages_seen', {
                readerId: session.user.id,
                seenAt: Date.now()
            })
        ])
        if (broadcast[0].status === "rejected") {
            console.error("[message/read] Read receipt broadcast failed:", broadcast[0].reason)
        }

        return new Response('OK')
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', { status: 422 })
        }
        return new Response('Internal server error', { status: 500 })
    }
}
