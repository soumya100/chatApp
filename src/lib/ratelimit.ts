import { db } from "./db"
import { nanoid } from "nanoid"

interface RateLimitConfig {
    limit: number
    windowSeconds: number
}

const slidingWindowRateLimit = `
-- sliding-window-rate-limit-v1
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - windowMs)
redis.call("ZADD", KEYS[1], now, ARGV[4])
local count = redis.call("ZCARD", KEYS[1])
redis.call("EXPIRE", KEYS[1], math.max(1, math.ceil((windowMs * 2) / 1000)))
return { count, count <= limit and 1 or 0 }
`

/**
 * Atomic sliding-window limiter powered by one Redis Lua transaction.
 * Concurrent requests cannot race between incrementing and checking the limit.
 */
export async function rateLimit(
    identifier: string,
    action: string,
    config: RateLimitConfig = { limit: 10, windowSeconds: 10 }
): Promise<{ success: boolean; remaining: number; reset: number }> {
    const safeLimit = Math.max(1, Math.floor(config.limit))
    const safeWindowSeconds = Math.max(1, Math.floor(config.windowSeconds))
    const now = Date.now()
    const windowMs = safeWindowSeconds * 1000
    const key = `ratelimit:${identifier}:${action}`
    const result = await db.eval(
        slidingWindowRateLimit,
        [key],
        [String(now), String(windowMs), String(safeLimit), `${now}:${nanoid(12)}`]
    ) as [number | string, number | string]
    const currentCount = Number(result[0]) || 0
    return {
        success: Number(result[1]) === 1,
        remaining: Math.max(0, safeLimit - currentCount),
        reset: Math.ceil(now / 1000) + safeWindowSeconds,
    }
}
