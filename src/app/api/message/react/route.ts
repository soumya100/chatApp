import { authOptions } from "@/lib/auth"
import { hasCurrentChatAccess } from "@/lib/chat-access"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

const reactValidator = z.object({
    messageId: z.string().min(1),
    chatId: z.string().min(1),
    emoji: z.string().min(1).max(8)
})

// Find, validate, toggle and replace the exact sorted-set member in one Redis
// operation. A concurrent reaction can no longer overwrite another user's
// update, and the ownership/deleted-message checks cannot be raced.
const atomicReact = `
local rows = redis.call("ZRANGE", KEYS[1], 0, -1)
for _, raw in ipairs(rows) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and message.id == ARGV[1] then
    if message.senderId == "system" or message.isDeleted then
      return cjson.encode({error = "Message cannot be reacted to"})
    end
    local reactions = message.reactions or {}
    local users = reactions[ARGV[2]] or cjson.decode("[]")
    local found = false
    local nextUsers = {}
    for _, id in ipairs(users) do
      if id == ARGV[3] then found = true else table.insert(nextUsers, id) end
    end
    if not found then table.insert(nextUsers, ARGV[3]) end
    if #nextUsers == 0 then reactions[ARGV[2]] = nil else reactions[ARGV[2]] = nextUsers end
    message.reactions = reactions
    local updated = cjson.encode(message)
    redis.call("ZREM", KEYS[1], raw)
    redis.call("ZADD", KEYS[1], tonumber(message.timestamp), updated)
    return cjson.encode({message = message, reactions = reactions})
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

        const parsed = reactValidator.safeParse(await req.json())
        if (!parsed.success) return new Response("Invalid request payload", { status: 422 })
        const { messageId, chatId, emoji } = parsed.data

        if (!(await hasCurrentChatAccess(db, chatId, userId))) return new Response("Forbidden", { status: 403 })

        const rawResult = await db.eval(atomicReact, [`chat:${chatId}:messages`], [messageId, emoji, userId])
        const result = decodeResult(rawResult)
        if (result?.error) {
            const status = result.error === "Message not found" ? 404 : 400
            return new Response(result.error, { status })
        }

        await Promise.allSettled([
            pusherServer.trigger(
                toPusherKey(`private-chat:${chatId}`),
                "message_reacted",
                { messageId, reactions: result.reactions }
            )
        ])
        return Response.json({ reactions: result.reactions })
    } catch (error) {
        console.error("[message/react] Failed:", error)
        return new Response("Internal server error", { status: 500 })
    }
}
