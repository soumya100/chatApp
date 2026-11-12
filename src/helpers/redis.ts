const upstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL
const authToken = process.env.UPSTASH_REDIS_REST_TOKEN

type Command = 'zrange' | 'sismember' | 'get' | 'smembers'

export async function fetchRedis(command: Command, ...args: (string | number)[]) {
    if (!upstashRedisRestUrl || !authToken) {
        throw new Error('Missing Upstash Redis environment variables')
    }

    // Use POST with JSON array body to avoid URL path concatenation issues with slashes or special characters
    const response = await fetch(upstashRedisRestUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify([command, ...args]),
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`Error executing Redis command: ${response.statusText}`)
    }

    const data = await response.json()
    return data.result
}
