import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

export async function POST(req: Request) {
    try {
        const body= await req.json()
        const session= await getServerSession(authOptions)

        if(!session?.user?.id){
            return new Response('Unauthorized', {status: 401})
        }

        //destructuring id to deny
        const {id: idToDeny}= z.object({id: z.string()}).parse(body)

        //removing this request from database
        await db.srem(`user:${session.user.id}:incoming_friend_requests`, idToDeny)

        //notify user sessions that the request was removed
        await pusherServer.trigger(
            toPusherKey(`private-user:${session.user.id}:incoming_friend_requests`),
            'friend_request_denied',
            { senderId: idToDeny }
        )

        return new Response('OK')

    } catch (error) {
        console.error(error)

        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', {status: 422})
        }

        return new Response('Invalid request', {status: 400})
    }
}