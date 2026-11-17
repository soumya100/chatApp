import { db } from "@/lib/db"
import { del } from "@vercel/blob"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function isOwnedVercelBlob(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com")
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get("authorization")
  if (!secret || authorization !== `Bearer ${secret}`) return Response.json({ message: "Unauthorized" }, { status: 401 })

  // This full-keyspace scan is intentionally retained for compatibility with
  // existing messages. A dedicated expiry index can replace it in a migration.
  const keys = await db.keys("chat:*:messages") as string[]
  let inspected = 0
  let deleted = 0
  let blobFailures = 0
  const now = Date.now()

  for (const key of keys) {
    const rows = await db.zrange(key, 0, -1) as unknown[]
    let expiredRawMembers: string[] = []

    for (const row of rows) {
      inspected++
      const rawMember = typeof row === "string" ? row : JSON.stringify(row)
      try {
        const message = JSON.parse(rawMember) as Message
        if (typeof message.expiresAt !== "number" || message.expiresAt > now) continue

        // Keep the Redis member until its attachment is deleted successfully.
        // This makes the next scheduled run retry a transient Blob failure.
        if (message.mediaUrl && isOwnedVercelBlob(message.mediaUrl)) {
          try {
            await del(message.mediaUrl)
          } catch (error) {
            blobFailures++
            console.error("[cron/cleanup-expired-messages] Blob deletion failed:", error)
            continue
          }
        }

        expiredRawMembers.push(rawMember)
        if (expiredRawMembers.length >= 100) {
          deleted += await db.zrem(key, ...expiredRawMembers)
          expiredRawMembers = []
        }
      } catch {
        // Leave malformed entries for the normal corruption-handling path.
      }
    }

    if (expiredRawMembers.length) deleted += await db.zrem(key, ...expiredRawMembers)
  }

  return Response.json({ success: true, inspected, deleted, blobFailures, ranAt: now })
}
