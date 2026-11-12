import { pusherClient } from '@/lib/pusher'
import { cn, toPusherKey } from '@/lib/utils'
import { User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FC, useEffect, useState } from 'react'

interface FriendRequestsSideBarOptionProps {
    sessionId: string,
    initialUnseenFriendRequests: number
}

const FriendRequestsSideBarOption: FC<FriendRequestsSideBarOptionProps> = ({initialUnseenFriendRequests, sessionId}) => {
    const pathName= usePathname()
    const [unSeenRequests, setUnSeenRequests] = useState<number>(initialUnseenFriendRequests)

    useEffect(() => {
        setUnSeenRequests(initialUnseenFriendRequests)
    }, [initialUnseenFriendRequests])

    useEffect(()=>{
        const incomingChannel = toPusherKey(`private-user:${sessionId}:incoming_friend_requests`)
        const friendsChannel = toPusherKey(`private-user:${sessionId}:friends`)

        pusherClient.subscribe(incomingChannel)
        pusherClient.subscribe(friendsChannel)

        const friendRequestHandler=()=>{
          setUnSeenRequests((prev)=> prev + 1)
        }

        const addedOrDeniedFriendHandler=()=>{
          setUnSeenRequests((prev)=> Math.max(0, prev - 1))
        }

        pusherClient.bind('incoming_friend_requests', friendRequestHandler)
        pusherClient.bind('new_friend', addedOrDeniedFriendHandler)
        pusherClient.bind('friend_request_denied', addedOrDeniedFriendHandler)

        return()=> {
          pusherClient.unsubscribe(incomingChannel)
          pusherClient.unsubscribe(friendsChannel)
          pusherClient.unbind('incoming_friend_requests', friendRequestHandler)
          pusherClient.unbind('new_friend', addedOrDeniedFriendHandler)
          pusherClient.unbind('friend_request_denied', addedOrDeniedFriendHandler)
        }

    },[sessionId])


  return <Link href={'/dashboard/requests'} className={cn(
    'group flex items-center gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold transition-colors',
    pathName === '/dashboard/requests' 
      ? 'bg-gray-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400' 
      : 'text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60'
  )}>
    <div className="text-gray-400 dark:text-zinc-500 border-gray-200 dark:border-zinc-700 group-hover:border-indigo-600 group-hover:text-indigo-600 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[0.625rem] font-medium bg-white dark:bg-zinc-800">
        <User className='h-4 w-4'/>
    </div>
    <p className="truncate">Friend requests</p>
    {unSeenRequests > 0 && (
        <div className='rounded-full w-5 h-5 text-xs flex justify-center items-center text-white bg-indigo-600 ml-auto'>
            {unSeenRequests}
        </div>
    )}
  </Link>
}

export default FriendRequestsSideBarOption