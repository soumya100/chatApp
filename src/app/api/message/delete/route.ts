import { authOptions } from "@/lib/auth"
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
        return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com")
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
    return cjson.encode({message = message})
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

        if (chatId.startsWith("group--")) {
            const groupId = chatId.slice("group--".length)
            const isMember = await db.sismember(`group:${groupId}:members`, userId)
            if (!isMember) return new Response("Forbidden: You are not a member of this group", { status: 403 })
        } else {
            const ids = chatId.split("--")
            if (ids.length !== 2 || !ids.includes(userId)) return new Response("Forbidden", { status: 403 })
        }

        // Preflight ownership before the external Blob call. The Lua mutation
        // repeats ownership/deleted checks atomically to close the Redis race.
        const existing = await findMessage(chatId, messageId)
        if (!existing) return new Response("Message not found", { status: 404 })
        if (existing.senderId === "system" || existing.isDeleted) {
            return new Response("System-generated or already deleted messages cannot be deleted", { status: 400 })
        }
        if (existing.senderId !== userId) return new Response("Forbidden: You can only delete your own messages", { status: 403 })

        if (existing.mediaUrl && isOwnedVercelBlob(existing.mediaUrl)) {
            try {
                await del(existing.mediaUrl)
            } catch (error) {
                console.error("[message/delete] Blob deletion failed:", error)
                return Response.json({ message: "Unable to permanently delete the attachment. Please retry." }, { status: 502 })
            }
        }

        const rawResult = await db.eval(atomicDelete, [`chat:${chatId}:messages`], [messageId, userId])
        const result = decodeResult(rawResult)
        if (result?.error) {
            const status = result.error === "Message not found" ? 404 : result.error === "Forbidden" ? 403 : 400
            return new Response(result.error, { status })
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
