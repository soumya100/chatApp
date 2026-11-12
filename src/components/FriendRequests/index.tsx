'use client'
import { NoContent } from '@/common'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import axios, { AxiosError } from 'axios'
import { UserCheck, UserPlus, UserRoundX } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface FriendRequestsProps {
    incomingFriendRequests: IncomingFriendRequest[],
    sessionId: string
}

const FriendRequests: FC<FriendRequestsProps> = ({ incomingFriendRequests, sessionId }) => {
    const router= useRouter()
    const [friendRequests, setFriendRequests] = useState<IncomingFriendRequest[]>(incomingFriendRequests)

    useEffect(() => {
        setFriendRequests(incomingFriendRequests)
    }, [incomingFriendRequests])

    useEffect(() => {
      const channelKey = toPusherKey(`private-user:${sessionId}:incoming_friend_requests`)
      pusherClient.subscribe(channelKey)

      const friendRequestHandler=({senderId, senderEmail, senderImage, senderName}: IncomingFriendRequest)=>{
        setFriendRequests((prev)=> {
            if (prev.some(r => r.senderId === senderId)) return prev
            return [...prev, { senderId, senderEmail, senderImage, senderName}]
        })
      }

      const friendDeniedHandler = ({ senderId }: { senderId: string }) => {
        setFriendRequests((prev) => prev.filter((r) => r.senderId !== senderId))
      }

      pusherClient.bind('incoming_friend_requests', friendRequestHandler)
      pusherClient.bind('friend_request_denied', friendDeniedHandler)

      return()=> {
        pusherClient.unsubscribe(channelKey)
        pusherClient.unbind('incoming_friend_requests', friendRequestHandler)
        pusherClient.unbind('friend_request_denied', friendDeniedHandler)
      }

    }, [sessionId])
       

    //accept or deny friend functionality
    const acceptOrDenyFriendRequest= async(senderId: string, type: 'accept' | 'deny')=>{
        try {
            switch(type){
                case 'accept':
                    await axios.post('/api/friends/accept', {id: senderId})
                    toast.success('Friend request accepted')
                break;
                case 'deny': 
                    await axios.post('/api/friends/deny', {id: senderId})
                    toast.success('Friend request declined')
                break;
                default:
                    throw new Error('Something went wrong')
            }
            setFriendRequests((prev)=> prev.filter((request) => request.senderId !== senderId))
            router.refresh()
        } catch (error) {
            if (error instanceof AxiosError) {
                toast.error(error.response?.data || 'Failed to process request')
                return
            }
            toast.error('Something went wrong')
        }
    }

    // console.log(friendRequests,'* fr')
    // console.log(incomingFriendRequests,'* incomingFriendRequests')

    return <main className='pt-8 px-6 sm:px-10'>
        <div className="flex gap-4 items-center mb-8">
            <UserPlus className="text-indigo-600 dark:text-indigo-400" />
            <h1 className="font-bold text-3xl text-gray-900 dark:text-gray-100">
                Friend Requests
            </h1>
        </div>
        <div className="flex flex-col gap-3">
            {
                friendRequests && friendRequests.length === 0 ?
                    <NoContent className='h-[50vh] w-full' noContentText='No pending friend requests'/> :
                    friendRequests && friendRequests.map((request) => (
                        <div key={request.senderId} className='flex gap-6 items-center bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 rounded-xl px-4 py-3.5 border border-gray-200 dark:border-zinc-800 shadow-xs transition-colors'>
                            <div className="relative h-14 w-14 bg-gray-50 dark:bg-zinc-800 rounded-full shrink-0">
                                <Image src={request.senderImage || ''} alt={`${request.senderName}'s avatar`} fill
                                    referrerPolicy='no-referrer'
                                    className='rounded-full'
                                />
                            </div>
                            <div className='truncate'>
                                <p className='font-semibold text-gray-800 dark:text-gray-200 text-base truncate'>
                                    {request.senderName}
                                </p>
                                <p className='font-normal text-gray-400 dark:text-gray-500 text-sm truncate'>
                                    {request.senderEmail}
                                </p>
                            </div>
                            <div className="flex gap-2.5 ml-auto shrink-0">
                                <button 
                                    aria-label='accept friend' 
                                    className='border border-green-200 dark:border-green-800/80 bg-green-50 dark:bg-green-950/40 hover:bg-green-100 rounded-lg p-2 transition-colors' 
                                    onClick={()=>acceptOrDenyFriendRequest(request.senderId, 'accept')}
                                    title='Accept'
                                >
                                    <UserCheck className='text-green-600 dark:text-green-400' size={18}/>
                                </button>
                                <button 
                                    aria-label='reject friend' 
                                    className='border border-red-200 dark:border-red-800/80 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 rounded-lg p-2 transition-colors' 
                                    onClick={()=>acceptOrDenyFriendRequest(request.senderId, 'deny')}
                                    title='Decline'
                                >
                                    <UserRoundX className='text-red-500 dark:text-red-400' size={18}/>
                                </button>
                            </div>
                        </div>
                    ))
            }
        </div>
    </main>
}

export default FriendRequests