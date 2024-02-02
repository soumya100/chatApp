import Chat from '@/components/Chat';
import { fetchRedis } from '@/helpers/redis';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { messageArrayValidator } from '@/lib/validations/message';
import { getServerSession } from 'next-auth';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { FC } from 'react'

interface pageProps {
  params:{
    chatId: string,
  }
}
async function getChatMessages(chatId:string) {
  try {
    const result: string[] = await fetchRedis('zrange', `chat:${chatId}:messages`, 0,-1)

    const dbMessages= result.map((message)=> JSON.parse(message) as Message)

    //reversing the array to show the recent chats
    const reversedDbMessages= dbMessages.reverse()

    //validating and parsing the reversed messages
    const messages= messageArrayValidator.parse(reversedDbMessages)

    return messages
  } catch (error) {
    notFound()
  }
} 

const page= async({params}: pageProps) => {

  const {chatId}= params;

  const session= await getServerSession(authOptions) 

  if(!session) notFound()

  const {user}= session;



  //taking user id of the chat sender and chat reciever and splitting it
  const [userId1, userId2]= chatId.split('--')


  //checking if the userid is either of thw two of above
  if(user.id !==userId1 && user.id !== userId2) notFound()

/*ternery for getting the chatPartnerId i.e if the urrent logged in userid is not 
equal to userId1 then the partner will be userId2 and vice-versa*/
  const chatPartnerId= user.id === userId1 ? userId2 : userId1
  const chatPartner= (await db.get(`user:${chatPartnerId}`)) as User

  const initialMessages= await getChatMessages(chatId)

  return <Chat chatPartner={chatPartner} initialMessages={initialMessages} sessionId={session.user.id}/>
}

export default page