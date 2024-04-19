import { fetchRedis } from "@/helpers/redis"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { z } from "zod"

export async function POST(req: Request) {
    try {
        const body = await req.json()

        const { id: idToAdd } = z.object({ id: z.string() }).parse(body)

        const session = await getServerSession(authOptions)

        //checking if the user is logged in or not
        if (!session) {
            return new Response('UnAuthorized', { status: 401 })
        }

        //verify if both users are not already friends
        const isAlreadyFriends = await fetchRedis('sismember',
            `user:${session.user.id}:friends`, idToAdd)

        if (isAlreadyFriends) {
            return new Response('Already friends', { status: 400 })
        }

        //checking if he already has the incoming friend request
        const hasFriendRequest = await fetchRedis('sismember',
            `user:${session.user.id}:incoming_friend_requests`,
            idToAdd)

        if (!hasFriendRequest) {
            return new Response("No friend request", { status: 400 })
        }

        const [userRaw, friendRaw] = (await Promise.all([
            fetchRedis('get', `user:${session.user.id}`),
            fetchRedis('get', `user:${idToAdd}`)
        ])) as [string, string]

        const user = JSON.parse(userRaw) as User
        const friend = JSON.parse(friendRaw) as User

        //notify added user

        await Promise.all([
            pusherServer.trigger(toPusherKey(`user:${idToAdd}:friends`), 'new_friend', user),
            pusherServer.trigger(toPusherKey(`user:${session.user.id}:friends`), 'new_friend', friend),
            db.sadd(`user:${session.user.id}:friends`, idToAdd), //adding friend to the users friend list
            db.sadd(`user:${idToAdd}:friends`, session.user.id), //adding userid to the requesters friendlist 
            db.srem(`user:${session.user.id}:incoming_friend_requests`, idToAdd)  //removing the id from the incoming friendlist database

        ])
        
        return new Response('OK')

    } catch (error) {
        console.error(error)

        if (error instanceof z.ZodError) {
            return new Response('Invalid request payload', { status: 422 })
        }

        return new Response('Invalid request', { status: 400 })
    }
}