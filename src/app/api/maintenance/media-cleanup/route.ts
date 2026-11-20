import { db } from "@/lib/db"
import { del } from "@vercel/blob"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BATCH_SIZE = 50
const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000

function isOwnedVercelBlob(url: unknown): url is string {
    if (typeof url !== "string") return false
    try {
        const parsed = new URL(url)
        return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com")
    } catch {
        return false
    }
}

/** Vercel Cron invokes this endpoint daily; failed jobs remain in Redis. */
export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) return Response.json({ error: "Cleanup job is not configured" }, { status: 503 })
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
        return new Response("Unauthorized", { status: 401 })
    }

    let deleted = 0
    let failed = 0
    const cleanupRows = await db.zrange("media:cleanup", 0, BATCH_SIZE - 1) as unknown[]
    for (const raw of cleanupRows) {
        const serialized = typeof raw === "string" ? raw : JSON.stringify(raw)
        try {
            const record = JSON.parse(serialized) as { url?: unknown }
            if (!isOwnedVercelBlob(record.url)) {
                await db.zrem("media:cleanup", serialized)
                continue
            }
            await del(record.url)
            await db.zrem("media:cleanup", serialized)
            deleted += 1
        } catch (error) {
            failed += 1
            console.error("[media-cleanup] Deferred deletion job retained:", error)
        }
    }

    // Completed uploads that were abandoned in the composer are not attached
    // to a message. Message persistence removes their URL from this index in
    // the same Lua transaction that stores the message.
    const orphanRows = await db.zrange("media:orphans", 0, BATCH_SIZE - 1) as unknown[]
    const cutoff = Date.now() - ORPHAN_GRACE_MS
    for (const raw of orphanRows) {
        const url = typeof raw === "string" ? raw : String(raw)
        const score = Number(await db.zscore("media:orphans", url))
        if (!Number.isFinite(score) || score > cutoff) continue
        try {
            if (isOwnedVercelBlob(url)) await del(url)
            await db.zrem("media:orphans", url)
            deleted += 1
        } catch (error) {
            failed += 1
            console.error("[media-cleanup] Abandoned upload retained for retry:", error)
        }
    }

    return Response.json({ deleted, failed, pendingCleanup: await db.zcard("media:cleanup"), pendingOrphans: await db.zcard("media:orphans") })
}
