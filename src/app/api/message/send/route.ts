import { fetchRedis } from "@/helpers/redis"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import {nanoid} from 'nanoid'
import { messageValidator } from "@/lib/validations/message"
import { toPusherKey } from "@/lib/utils"
import { pusherServer } from "@/lib/pusher"

export async function POST(req:Request) {
 try {
   const {text, chatId}:{
    text: string,
    chatId: string
   }= await req.json()

   const session= await getServerSession(authOptions)

   //checking for session
   if(!session){
       return new Response('UnAuthorized', {status: 401})
   }

  //checking for if enyone else is accessing it or not
   const[userId1, userId2]= chatId.split('--')
  if(session.user.id !== userId1 && session.user.id !== userId2){
        return new Response('UnAuthorized', {status: 401})
  }

  const friendId= session.user.id === userId1 ? userId2 : userId1

  const friendList= await fetchRedis('smembers', `user:${session.user.id}:friends`) as string[]
  const isFriend= friendList.includes(friendId)
  
  if(!isFriend){
    return new Response('UnAuthorized', {status: 401})
}
const sender= await fetchRedis('get', `user:${session?.user.id}`) as string 

const parsedSender= JSON.parse(sender) as User

const timeStamp= Date.now()
const messageData: Message= {
    id: nanoid(),
    receiverId: friendId,
    senderId: session.user.id,
    text,
    timestamp: timeStamp
}

const message= messageValidator.parse(messageData)

     //notify all connected chat room clients
     pusherServer.trigger(toPusherKey(`chat:${chatId}`), 'incoming-message', message)
    pusherServer.trigger(toPusherKey(`user:${friendId}:chats`), 'new_message',{
        ...message,
        senderImg: parsedSender.image,
        senderName: parsedSender.name
    })



    //if every data is valid, send the message
    await db.zadd(`chat:${chatId}:messages`, {
        score: timeStamp,
        member: JSON.stringify(message)
    })

    return new Response('OK')
 } catch (error) {
    if(error instanceof Error){
        return new Response(error.message, {status: 500})
    }
    return new Response('Internal server error', {status: 500})
 }   
}