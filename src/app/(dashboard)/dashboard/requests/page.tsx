import FriendRequests from '@/components/FriendRequests'
import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'


const page=async ({}) => {
    
    const session= await getServerSession(authOptions)
    
    if(!session) notFound()
    
    //fetching ids of people who sent current logged in user a friend request
    const incomingSenderIds=(await fetchRedis('smembers', `user:${session.user.id}:incoming_friend_requests`)) as string[] 

    //fetching emails of people who sent friend request to the logged in user
    const incomingFriendRequests= await Promise.all(
        incomingSenderIds.map(async (senderId)=>{
            const sender= (await fetchRedis('get', `user:${senderId}`)) as string

            const senderParsed= JSON.parse(sender) as User
            return{
                senderId,
                senderEmail: senderParsed.email,
                senderName: senderParsed.name,
                senderImage: senderParsed.image,
            }
        })
    )

    console.log(incomingFriendRequests, '* incomingFriendRequests' )

  return <FriendRequests incomingFriendRequests={incomingFriendRequests} sessionId={session.user.id} />
}

export default page