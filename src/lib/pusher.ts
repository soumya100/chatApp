import PusherServer from 'pusher'
import PusherClient from 'pusher-js'

const cluster = process.env.PUSHER_APP_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER || 'ap2'

export const pusherServer = new PusherServer({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
    secret: process.env.PUSHER_APP_SECRET!,
    cluster,
    useTLS: true,
})

export const pusherClient = new PusherClient(
    process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
    {
        cluster,
        authEndpoint: '/api/pusher/auth',
        authTransport: 'ajax',
    }
)