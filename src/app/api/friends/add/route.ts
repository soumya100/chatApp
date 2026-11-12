import { fetchRedis } from "@/helpers/redis"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { addFriendValidator } from "@/lib/validations/add-friends"
import { rateLimit } from "@/lib/ratelimit"
import { getServerSession } from "next-auth"
import { z } from "zod"

export async function POST(req: Request) {
    try {
        const body = await req.json()

        const session = await getServerSession(authOptions)

        //session checking
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        // Rate limit: max 5 friend requests per minute
        const { success: isAllowed } = await rateLimit(session.user.id, 'add_friend', {
            limit: 5,
            windowSeconds: 60
        })
        if (!isAllowed) {
            return new Response('Too many friend requests sent. Please wait a minute before trying again.', {
                status: 429,
                headers: { 'Retry-After': '60' }
            })
        }

        const rawIdentifier = typeof body === 'object' && body !== null && typeof body.email === 'object' && body.email !== null
            ? body.email.email
            : body?.email ?? body

        const { email: identifier } = addFriendValidator.parse({ email: rawIdentifier })
        const normalized = identifier.trim().toLowerCase()

        // 1. Check if identifier matches an email index
        let idToAdd = (await fetchRedis('get', `user:email:${normalized}`)) as string | null

        // 2. Check if identifier matches a username index
        if (!idToAdd) {
            idToAdd = (await fetchRedis('get', `user:name:${normalized}`)) as string | null
        }

        // 3. Fallback: Search all registered users by full name, stripped username, or email
        if (!idToAdd) {
            const allUserIds = (await db.smembers('users')) as string[]
            if (allUserIds && allUserIds.length > 0) {
                const pipeline = db.pipeline()
                allUserIds.forEach((uid) => pipeline.get(`user:${uid}`))
                const results = await pipeline.exec()
                for (const raw of results) {
                    if (!raw) continue
                    try {
                        const u = (typeof raw === 'string' ? JSON.parse(raw) : raw) as User
                        if (
                            u &&
                            (u.name?.toLowerCase().trim() === normalized ||
                             u.name?.toLowerCase().replace(/\s+/g, '') === normalized ||
                             u.email?.toLowerCase().trim() === normalized)
                        ) {
                            idToAdd = u.id
                            break
                        }
                    } catch {}
                }
            }
        }

        // If this person doesn't exist
        if (!idToAdd) {
            return new Response('User not found. Please check the username or email address.', { status: 400 })
        }

        //checking if the user logged in is trying to add the same person as friend
        if(idToAdd === session.user.id){
            return new Response('You cannot add yourself as your friend', {status: 400})
        }

        //checking if the user is already added
        const isAlreadyAdded= (await fetchRedis('sismember',
         `user:${idToAdd}:incoming_friend_requests`, 
        session.user.id)) as 0 | 1 /*sismember=> setismember in redis unstructured array of data 
                                                            second param is string what we want to create in our database*/
        if(isAlreadyAdded){
            return new Response('Already added this user', { status: 400})
        }

        //checking if the user is already a friend
        const isAlreadyFriend= (await fetchRedis('sismember',
         `user:${session.user.id}:friends`, 
       idToAdd)) as 0 | 1 

        if(isAlreadyFriend){
            return new Response('Already friends with this user', { status: 400})
        }

        //valid request, save to database first
        await db.sadd(`user:${idToAdd}:incoming_friend_requests`, session.user.id)

        //notify added user in real time via private channel
        await pusherServer.trigger(
            toPusherKey(`private-user:${idToAdd}:incoming_friend_requests`),
            'incoming_friend_requests',
            {
                senderId: session.user.id,
                senderEmail: session.user.email,
                senderImage: session.user.image,
                senderName: session.user.name
            }
        )

        return new Response('OK')

    } catch (error) {
        console.error(error)
        if(error instanceof z.ZodError){
            return new Response('Invalid request payload', {status: 422}) //catch errors 
        }

        return new Response('Invalid Request', {status: 400}) //if any other error occures
    }
}