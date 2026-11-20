import { db } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Authenticated Redis readiness/operations probe.
 * Exposes bounded queue counters only; never returns keys, user IDs or payloads.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ status: "unconfigured" }, { status: 503 })
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const checkedAt = Date.now()
  try {
    const [ping, expiryBacklog, mediaCleanupBacklog, mediaOrphanBacklog] = await Promise.all([
      db.ping(),
      db.zcard("chat:expiring"),
      db.zcard("media:cleanup"),
      db.zcard("media:orphans"),
    ])
    const queues = {
      expiry: Number(expiryBacklog) || 0,
      mediaCleanup: Number(mediaCleanupBacklog) || 0,
      mediaOrphans: Number(mediaOrphanBacklog) || 0,
    }
    const totalPending = queues.expiry + queues.mediaCleanup + queues.mediaOrphans
    return Response.json({
      status: ping === "PONG" ? "ok" : "degraded",
      redis: ping === "PONG" ? "reachable" : "unexpected-response",
      queues,
      totalPending,
      checkedAt,
    }, { status: ping === "PONG" ? 200 : 503 })
  } catch {
    // Do not leak Redis URLs, tokens, commands or raw provider errors.
    return Response.json({
      status: "unavailable",
      redis: "unreachable",
      checkedAt,
    }, { status: 503 })
  }
}
