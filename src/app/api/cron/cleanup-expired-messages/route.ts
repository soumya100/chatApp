import { db } from "@/lib/db"
import { del } from "@vercel/blob"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type ExpiryEntry = { chatKey: string; messageId: string; raw: string }

function isOwnedVercelBlob(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com")
  } catch {
    return false
  }
}

function parseMessage(raw: unknown): { message: Message; raw: string } | null {
  const serialized = typeof raw === "string" ? raw : JSON.stringify(raw)
  try { return { message: JSON.parse(serialized) as Message, raw: serialized } }
  catch { return null }
}

async function migrateLegacyExpiryEntries() {
  const marker = await db.get("chat:expiring:migration-complete")
  if (marker) return

  // One-time backfill for messages created before the expiry index existed.
  // ZADD is idempotent, so an interrupted migration can safely be retried.
  const keys = await db.keys("chat:*:messages") as string[]
  let pipeline = db.pipeline()
  let pending = 0
  for (const chatKey of keys) {
    const rows = await db.zrange(chatKey, 0, -1) as unknown[]
    for (const row of rows) {
      const parsed = parseMessage(row)
      if (!parsed || typeof parsed.message.expiresAt !== "number") continue
      const entry: ExpiryEntry = { chatKey, messageId: parsed.message.id, raw: parsed.raw }
      pipeline.zadd("chat:expiring", { score: parsed.message.expiresAt, member: JSON.stringify(entry) })
      pending++
      if (pending >= 250) {
        await pipeline.exec()
        pipeline = db.pipeline()
        pending = 0
      }
    }
  }
  if (pending) await pipeline.exec()
  await db.set("chat:expiring:migration-complete", "1")
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get("authorization")
  if (!secret || authorization !== `Bearer ${secret}`) return Response.json({ message: "Unauthorized" }, { status: 401 })

  try {
    await migrateLegacyExpiryEntries()
    const now = Date.now()
    let inspected = 0
    let deleted = 0
    let blobFailures = 0
    let batches = 0
    let hasMore = false

    // Process bounded batches so a large backlog can continue on the next run
    // instead of loading every chat history into memory every hour.
    while (batches < 20) {
      const due = await db.zrange("chat:expiring", "-inf", now, { byScore: true, offset: 0, count: 100 }) as unknown[]
      if (!due.length) { hasMore = false; break }
      batches++
      inspected += due.length

      for (const row of due) {
        const indexRaw = typeof row === "string" ? row : JSON.stringify(row)
        let entry: ExpiryEntry
        try { entry = JSON.parse(indexRaw) as ExpiryEntry }
        catch {
          await db.zrem("chat:expiring", indexRaw)
          continue
        }

        let currentRaw = entry.raw
        let parsed = parseMessage(currentRaw)
        if (!parsed || parsed.message.id !== entry.messageId) {
          await db.zrem("chat:expiring", indexRaw)
          continue
        }

        // Message edits/reactions can replace the serialized sorted-set member.
        // Reconcile by stable message ID before deciding whether it still expires.
        const stillPresent = await db.zscore(entry.chatKey, currentRaw)
        if (stillPresent === null) {
          const rows = await db.zrange(entry.chatKey, 0, -1) as unknown[]
          const current = rows.map(parseMessage).find(item => item?.message.id === entry.messageId) || null
          if (!current) {
            await db.zrem("chat:expiring", indexRaw)
            continue
          }
          if (typeof current.message.expiresAt !== "number") {
            await db.zrem("chat:expiring", indexRaw)
            continue
          }
          if (current.message.expiresAt > now) {
            const nextEntry: ExpiryEntry = { chatKey: entry.chatKey, messageId: entry.messageId, raw: current.raw }
            const pipeline = db.pipeline()
            pipeline.zrem("chat:expiring", indexRaw)
            pipeline.zadd("chat:expiring", { score: current.message.expiresAt, member: JSON.stringify(nextEntry) })
            await pipeline.exec()
            continue
          }
          currentRaw = current.raw
          parsed = current
        }

        if (typeof parsed.message.expiresAt !== "number" || parsed.message.expiresAt > now) {
          await db.zrem("chat:expiring", indexRaw)
          continue
        }

        if (parsed.message.mediaUrl && isOwnedVercelBlob(parsed.message.mediaUrl)) {
          try {
            await del(parsed.message.mediaUrl)
          } catch (error) {
            blobFailures++
            console.error("[cron/cleanup-expired-messages] Blob deletion failed:", error)
            continue
          }
        }

        const pipeline = db.pipeline()
        pipeline.zrem(entry.chatKey, currentRaw)
        pipeline.zrem("chat:expiring", indexRaw)
        const results = await pipeline.exec()
        deleted += Number(results?.[0] || 0)
      }

      hasMore = due.length === 100 || blobFailures > 0
      if (blobFailures > 0 || !hasMore) break
    }

    return Response.json({ success: blobFailures === 0, inspected, deleted, blobFailures, hasMore, batches, ranAt: now }, { status: blobFailures > 0 ? 503 : 200 })
  } catch (error) {
    console.error("[cron/cleanup-expired-messages] Cleanup failed:", error)
    return Response.json({ message: "Cleanup failed" }, { status: 500 })
  }
}
