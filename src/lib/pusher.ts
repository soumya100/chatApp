import PusherServer from "pusher"
import PusherClient from "pusher-js"

const cluster =
    process.env.PUSHER_APP_CLUSTER ||
    process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER ||
    "ap2"

let server: PusherServer | undefined
let client: PusherClient | undefined

function getPusherServer(): PusherServer {
    if (server) return server

    const appId = process.env.PUSHER_APP_ID
    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY
    const secret = process.env.PUSHER_APP_SECRET

    if (!appId || !key || !secret) {
        throw new Error(
            "Pusher server is not configured. Set PUSHER_APP_ID, NEXT_PUBLIC_PUSHER_APP_KEY, and PUSHER_APP_SECRET."
        )
    }

    server = new PusherServer({
        appId,
        key,
        secret,
        cluster,
        useTLS: true,
    })

    return server
}

function getPusherClient(): PusherClient {
    if (client) return client

    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY

    if (!key) {
        throw new Error("Pusher client is not configured. Set NEXT_PUBLIC_PUSHER_APP_KEY.")
    }

    client = new PusherClient(key, {
        cluster,
        authEndpoint: "/api/pusher/auth",
        authTransport: "ajax",
    })

    return client
}

// Defer SDK construction until the corresponding Pusher API is used, so
// build-time route analysis does not require runtime deployment credentials.
export const pusherServer = new Proxy({} as PusherServer, {
    get(_target, property) {
        if (property === "then") return undefined

        const instance = getPusherServer()
        const value = Reflect.get(instance, property, instance)

        return typeof value === "function" ? value.bind(instance) : value
    },
})

export const pusherClient = new Proxy({} as PusherClient, {
    get(_target, property) {
        if (property === "then") return undefined

        const instance = getPusherClient()
        const value = Reflect.get(instance, property, instance)

        return typeof value === "function" ? value.bind(instance) : value
    },
})
