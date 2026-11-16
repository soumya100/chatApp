import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get("authorization")
  if (!secret || authorization !== `Bearer ${secret}`) return Response.json({ message: "Unauthorized" }, { status: 401 })

  // Redis has no native per-member TTL for sorted-set entries. Scan only chat
  // message keys, then remove expired serialized members in bounded batches.
  const keys = await db.keys("chat:*:messages") as string[]
  let inspected = 0
  let deleted = 0
  const now = Date.now()
  for (const key of keys) {
    const rows = await db.zrange(key, 0, -1) as unknown[]
    const expired: string[] = []
    for (const row of rows) {
      inspected++
      try {
        const message = (typeof row === "string" ? JSON.parse(row) : row) as Message
        if (typeof message.expiresAt === "number" && message.expiresAt <= now) expired.push(JSON.stringify(message))
      } catch {
        // Leave malformed entries for the normal corruption-handling path.
      }
      if (expired.length >= 100) {
        deleted += await db.zrem(key, ...expired)
        expired.length = 0
      }
    }
    if (expired.length) deleted += await db.zrem(key, ...expired)
  }
  return Response.json({ success: true, inspected, deleted, ranAt: now })
}
