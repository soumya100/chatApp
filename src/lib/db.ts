import { Redis } from "@upstash/redis"

let redis: Redis | undefined

function getRedis(): Redis {
    if (redis) return redis

    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
        throw new Error(
            "Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
        )
    }

    redis = new Redis({ url, token })
    return redis
}

// Defer client creation until a Redis command is actually used. This prevents
// Next.js from requiring deployment secrets while collecting route page data.
export const db = new Proxy({} as Redis, {
    get(_target, property) {
        if (property === "then") return undefined

        const client = getRedis()
        const value = Reflect.get(client, property, client)

        return typeof value === "function" ? value.bind(client) : value
    },
})
