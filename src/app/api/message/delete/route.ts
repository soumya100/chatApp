import { authOptions } from "@/lib/auth"
import { hasCurrentChatAccess } from "@/lib/chat-access"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { del } from "@vercel/blob"
import { z } from "zod"

const deleteValidator = z.object({
    messageId: z.string().min(1),
    chatId: z.string().min(1)
})

function isOwnedVercelBlob(url: string) {
    try {
        const parsed = new URL(url)
        return parsed.protocol === "https:"
            && !parsed.username
            && !parsed.password
            && !parsed.port
            && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.public\.blob\.vercel-storage\.com$/i.test(parsed.hostname)
            && parsed.pathname.length > 1
            && !parsed.search
            && !parsed.hash
    } catch {
        return false
    }
}

const atomicDelete = `
local rows = redis.call("ZRANGE", KEYS[1], 0, -1)
for _, raw in ipairs(rows) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and message.id == ARGV[1] then
    if message.senderId == "system" or message.isDeleted then
      return cjson.encode({error = "Message cannot be deleted"})
    end
    if message.senderId ~= ARGV[2] then
      return cjson.encode({error = "Forbidden"})
    end
    local cleanupRecord = nil
    if message.mediaUrl and string.match(message.mediaUrl, "^https://[A-Za-z0-9][A-Za-z0-9%-]*%.public%.blob%.vercel%-storage%.com/") then
      cleanupRecord = cjson.encode({url = message.mediaUrl, queuedAt = tonumber(ARGV[3])})
      redis.call("ZADD", KEYS[2], tonumber(ARGV[3]), cleanupRecord)
    end
    message.text = "This message was deleted"
    message.isDeleted = true
    message.mediaUrl = nil
    message.mediaType = nil
    message.fileName = nil
    message.fileSize = nil
    message.duration = nil
    message.senderImg = nil
    local updated = cjson.encode(message)
    redis.call("ZREM", KEYS[1], raw)
    redis.call("ZADD", KEYS[1], tonumber(message.timestamp), updated)
    return cjson.encode({message = message, cleanupRecord = cleanupRecord})
  end
end
return cjson.encode({error = "Message not found"})
`

function decodeResult(value: unknown): any {
    return typeof value === "string" ? JSON.parse(value) : value
}

async function findMessage(chatId: string, messageId: string): Promise<Message | null> {
    const rows = await db.zrange(`chat:${chatId}:messages`, 0, -1) as unknown[]
    for (const row of rows) {
        try {
            const message = (typeof row === "string" ? JSON.parse(row) : row) as Message
            if (message.id === messageId) return message
        } catch {
            // Ignore malformed legacy rows and continue looking.
        }
    }
    return null
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        const userId = session?.user?.id
        if (!userId) return new Response("Unauthorized", { status: 401 })

        const parsed = deleteValidator.safeParse(await req.json())
        if (!parsed.success) return new Response("Invalid request payload", { status: 422 })
        const { messageId, chatId } = parsed.data

        if (!(await hasCurrentChatAccess(db, chatId, userId))) return new Response("Forbidden", { status: 403 })

        // Preflight ownership; the Lua script repeats the check and enqueues
        // owned Blob URLs atomically with the tombstone before any external call.
        const existing = await findMessage(chatId, messageId)
        if (!existing) return new Response("Message not found", { status: 404 })
        if (existing.senderId === "system" || existing.isDeleted) {
            return new Response("System-generated or already deleted messages cannot be deleted", { status: 400 })
        }
        if (existing.senderId !== userId) return new Response("Forbidden: You can only delete your own messages", { status: 403 })

        const rawResult = await db.eval(atomicDelete, [`chat:${chatId}:messages`, "media:cleanup"], [messageId, userId, String(Date.now())])
        const result = decodeResult(rawResult)
        if (result?.error) {
            const status = result.error === "Message not found" ? 404 : result.error === "Forbidden" ? 403 : 400
            return new Response(result.error, { status })
        }

        // Metadata is already tombstoned. Blob deletion is now retryable: a
        // storage outage leaves a durable cleanup job instead of a live message
        // pointing at a deleted object (or a deleted message leaking the object).
        if (result.cleanupRecord) {
            try {
                const cleanup = JSON.parse(result.cleanupRecord) as { url: string }
                if (isOwnedVercelBlob(cleanup.url)) {
                    await del(cleanup.url)
                    await db.zrem("media:cleanup", result.cleanupRecord)
                }
            } catch (error) {
                console.error("[message/delete] Blob cleanup deferred for retry:", error)
            }
        }

        await Promise.allSettled([
            pusherServer.trigger(
                toPusherKey(`private-chat:${chatId}`),
                "message_deleted",
                { messageId }
            )
        ])
        return new Response("OK")
    } catch (error) {
        console.error("[message/delete] Failed:", error)
        return new Response("Internal server error", { status: 500 })
    }
}
