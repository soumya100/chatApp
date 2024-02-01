import { fetchRedis } from "@/helpers/redis"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { addFriendValidator } from "@/lib/validations/add-friends"
import { getServerSession } from "next-auth"
import { z } from "zod"

export async function POST(req: Request) {
    try {
        const body = await req.json()

        const { email: emailToAdd } = addFriendValidator.parse(body.email)

       const idToAdd= await fetchRedis('get', `user:email:${emailToAdd}`) as string



        //if this person doesnt exist
        if (!idToAdd) {
            return new Response('This person does not exist.', {status: 400})
        }

        const session = await getServerSession(authOptions)

        //session checking
        if (!session) {
            return new Response('Unauthorized', { status: 401 })
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

        //valid request, sending friend request
        db.sadd(`user:${idToAdd}:incoming_friend_requests`, session.user.id)
        return new Response('OK')

    } catch (error) {
        console.error(error)
        if(error instanceof z.ZodError){
            return new Response('Invalid request payload', {status: 422}) //catch errors 
        }

        return new Response('Invalid Request', {status: 400}) //if any other error occures
    }
}