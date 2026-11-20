import { authOptions } from "@/lib/auth"
import { hasCurrentChatAccess } from "@/lib/chat-access"
import { db } from "@/lib/db"
import { groupPreferencesKey, parseStoredGroupPreferences } from "@/lib/group-preferences"
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

        if (!(await hasCurrentChatAccess(db, chatId, session.user.id))) return new Response("Forbidden", { status: 403 })

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
                if (!validated.expiresAt || validated.expiresAt > Date.now()) messages.push(validated)
            } catch {
                // skip corrupted message
            }
        }

        // Use the raw page boundary, not the filtered list. Expired or malformed
        // rows must not make the client believe that older history is exhausted.
        const boundaryRaw = rawMessages.length ? rawMessages[rawMessages.length - 1] : null
        let nextCursor: number | null = null
        if (boundaryRaw) {
            try {
                const boundary = typeof boundaryRaw === "string" ? JSON.parse(boundaryRaw) : boundaryRaw
                if (typeof boundary?.timestamp === "number") nextCursor = boundary.timestamp
            } catch {
                nextCursor = null
            }
        }

        // Apply each sender's current group-level photo visibility preference
        // to historical messages as well as to newly broadcast messages.
        if (chatId.startsWith("group--") && messages.length) {
            const groupId = chatId.slice("group--".length)
            const senderIds = Array.from(new Set(messages.map(message => message.senderId).filter(id => id !== "system")))
            if (senderIds.length) {
                const preferencesPipeline = db.pipeline()
                senderIds.forEach(senderId => preferencesPipeline.get(groupPreferencesKey(senderId, groupId)))
                const preferenceRows = await preferencesPipeline.exec()
                const hiddenSenders = new Set<string>()
                preferenceRows.forEach((raw, index) => {
                    const stored = parseStoredGroupPreferences(raw)
                    // Fail closed: an undecodable preference record must not
                    // expose a photo the sender may have wanted hidden.
                    if (stored.status === "corrupt" || stored.preferences.hideProfilePhoto) {
                        hiddenSenders.add(senderIds[index])
                    }
                })
                messages.forEach(message => {
                    if (hiddenSenders.has(message.senderId)) message.senderImg = undefined
                })
            }
        }

        return Response.json({
            messages,
            hasMore: rawMessages.length === limit,
            nextCursor
        })

    } catch (error) {
        if (error instanceof z.ZodError) {
            return new Response('Invalid query parameters', { status: 422 })
        }
        return new Response('Internal Server Error', { status: 500 })
    }
}

