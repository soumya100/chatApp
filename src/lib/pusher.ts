import PusherServer from 'pusher'
import PusherClient from 'pusher-js'


const CLUSTER= 'ap2'

export const pusherServer = new PusherServer({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
    secret: process.env.PUSHER_APP_SECRET!,
    cluster: CLUSTER!, // amke sure to change this as per your data
    useTLS: true //for encrypted data traffic
})

export const pusherClient= new PusherClient(process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
    {
        cluster: CLUSTER!,  //make sure to change this while
    })