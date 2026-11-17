import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

const editValidator = z.object({
    messageId: z.string().min(1),
    chatId: z.string().min(1),
    newText: z.string().max(2000).default("")
})

const atomicEdit = `
local rows = redis.call("ZRANGE", KEYS[1], 0, -1)
for _, raw in ipairs(rows) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and message.id == ARGV[1] then
    if message.senderId == "system" or message.isDeleted then
      return cjson.encode({error = "Message cannot be edited"})
    end
    if message.senderId ~= ARGV[2] then
      return cjson.encode({error = "Forbidden"})
    end
    if (not message.mediaUrl or message.mediaUrl == cjson.null) and string.len(string.gsub(ARGV[3], "%s", "")) == 0 then
      return cjson.encode({error = "Message text cannot be empty"})
    end
    message.text = ARGV[3]
    message.isEdited = true
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

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        const userId = session?.user?.id
        if (!userId) return new Response("Unauthorized", { status: 401 })

        const parsed = editValidator.safeParse(await req.json())
        if (!parsed.success) return new Response("Invalid request payload", { status: 422 })
        const { messageId, chatId, newText } = parsed.data

        if (chatId.startsWith("group--")) {
            const groupId = chatId.slice("group--".length)
            const isMember = await db.sismember(`group:${groupId}:members`, userId)
            if (!isMember) return new Response("Forbidden: You are not a member of this group", { status: 403 })
        } else {
            const ids = chatId.split("--")
            if (ids.length !== 2 || !ids.includes(userId)) return new Response("Forbidden", { status: 403 })
            const friendId = ids[0] === userId ? ids[1] : ids[0]
            const isFriend = await db.sismember(`user:${userId}:friends`, friendId)
            if (!isFriend) return new Response("Forbidden", { status: 403 })
        }

        const rawResult = await db.eval(atomicEdit, [`chat:${chatId}:messages`], [messageId, userId, newText])
        const result = decodeResult(rawResult)
        if (result?.error) {
            const status = result.error === "Message not found" ? 404 : result.error === "Forbidden" ? 403 : 400
            return new Response(result.error, { status })
        }

        await Promise.allSettled([
            pusherServer.trigger(
                toPusherKey(`private-chat:${chatId}`),
                "message_edited",
                { messageId, text: newText, isEdited: true }
            )
        ])
        return new Response("OK")
    } catch (error) {
        console.error("[message/edit] Failed:", error)
        return new Response("Internal server error", { status: 500 })
    }
}
