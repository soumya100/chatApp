'use client'
import { NoContent } from '@/common'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import axios from 'axios'
import { UserCheck, UserPlus, UserRoundX } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FC, useEffect, useState } from 'react'

interface FriendRequestsProps {
    incomingFriendRequests: IncomingFriendRequest[],
    sessionId: string
}

const FriendRequests: FC<FriendRequestsProps> = ({ incomingFriendRequests, sessionId }) => {
    const router= useRouter()
    const [friendRequests, setFriendRequests] = useState<IncomingFriendRequest[]>(incomingFriendRequests)
    useEffect(() => {
      pusherClient.subscribe(
        toPusherKey(`user:${sessionId}:incoming_friend_requests`) //listening to the changes
      )

      const friendRequestHandler=({senderId, senderEmail, senderImage, senderName}: IncomingFriendRequest)=>{
        setFriendRequests((prev)=> [...prev, { senderId, senderEmail, senderImage, senderName}])
      }

      pusherClient.bind('incoming_friend_requests', friendRequestHandler) // telling pusher what to do when the changes occurs


      return()=> {
        //cleaning up the events for optimising performances
        pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:incoming_friend_requests`))
        pusherClient.unbind('incoming_friend_requests', friendRequestHandler)
      }

    }, [sessionId])
       

    //accept friend functionality
    const acceptOrDenyFriendRequest= async(senderId: string, type: 'accept' | 'deny')=>{
        try {
            switch(type){
                case 'accept':
                    await axios.post('/api/friends/accept', {id: senderId})
                break;
                case 'deny': 
                    await axios.post('/api/friends/deny', {id: senderId})
                break;
                default:
                    throw new Error('Something went wrong')
            }
            setFriendRequests((prev)=> prev.filter((request) => request.senderId !== senderId))
            router.refresh()
        } catch (error) {
            
        }
    }

    // console.log(friendRequests,'* fr')
    // console.log(incomingFriendRequests,'* incomingFriendRequests')

    return <main className='pt-8 px-10'>
        <div className="flex gap-5 items-center mb-8">
        <UserPlus />
        <h1 className="font-bold text-2xl">
            Friend Requests
        </h1>
        </div>
        <div className="flex flex-col gap-4">
            {
                friendRequests && friendRequests.length === 0 ?
                    <NoContent className='h-[60vh] w-[60vw]' noContentText='No friend requests found'/> :
                    friendRequests && friendRequests.map((request) => (
                        <div key={request.senderId} className='flex gap-10 items-center hover:bg-zinc-50 cursor-pointer rounded-md px-2 py-3 border-[0.5px]'>
                            <div className="relative h-16 w-16 bg-gray-50 rounded-full">
                                <Image src={request.senderImage || ''} alt={`profile image`} fill
                                    referrerPolicy='no-referrer'
                                    className='rounded-full'
                                />
                            </div>
                            <div>
                                <p className='font-semibold text-slate-400 text-lg'>
                                    {request.senderName}
                                </p>
                                <p className='font-medium text-slate-300 text-md'>
                                    {request.senderEmail}
                                </p>
                            </div>
                            <div className="flex gap-5">
                            <button aria-label='accept friend' className='border border-green-300 rounded-md p-2' onClick={()=>acceptOrDenyFriendRequest(request.senderId, 'accept')}>
                                <UserCheck className='font-semibold text-green-400 hover:text-green-600' size={20}/>
                                </button>
                            <button aria-label='reject friend' className='border border-red-400 rounded-md p-2' onClick={()=>acceptOrDenyFriendRequest(request.senderId, 'deny')}>
                            <UserRoundX className='font-semibold text-red-500 hover:text-red-700' size={20}/>
                            </button>
                            </div>
                        </div>
                    ))
            }
        </div>
    </main>
}

export default FriendRequests