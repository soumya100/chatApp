import { db } from "./db"
import { nanoid } from "nanoid"

interface RateLimitConfig {
    limit: number
    windowSeconds: number
}

/**
 * Sliding-window rate limiter powered by Upstash Redis sorted sets.
 * Prevents API spamming without requiring extra third-party dependencies.
 */
export async function rateLimit(
    identifier: string,
    action: string,
    config: RateLimitConfig = { limit: 10, windowSeconds: 10 }
): Promise<{ success: boolean; remaining: number; reset: number }> {
    const key = `ratelimit:${identifier}:${action}`
    const now = Date.now()
    const windowMs = config.windowSeconds * 1000
    const clearBefore = now - windowMs

    const pipeline = db.pipeline()
    pipeline.zremrangebyscore(key, 0, clearBefore)
    pipeline.zadd(key, { score: now, member: `${now}:${nanoid(6)}` })
    pipeline.zcard(key)
    pipeline.expire(key, config.windowSeconds * 2)

    const results = await pipeline.exec()
    const currentCount = (results[2] as number) || 1

    const success = currentCount <= config.limit
    const remaining = Math.max(0, config.limit - currentCount)
    const reset = Math.ceil(now / 1000) + config.windowSeconds

    return {
        success,
        remaining,
        reset
    }
}

