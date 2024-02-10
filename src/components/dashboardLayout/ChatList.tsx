"use client"
import { UnSeenChatToast } from '@/common'
import { pusherClient } from '@/lib/pusher'
import { chatHrefConstructor, toPusherKey } from '@/lib/utils'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface ChatListProps {
    friends: User[],
    sessionId: string
}

interface ExtendedMessage extends Message{
  senderImg: string,
  senderName: string
}

const ChatList: FC<ChatListProps> = ({friends, sessionId}) => {
    const router=useRouter()
    const pathName=usePathname()
    const [unSeenMessages, setUnSeenMessages]= useState<Message[]>([])

    useEffect(() => {
      pusherClient.subscribe(toPusherKey(`user:${sessionId}:chats`))
      pusherClient.subscribe(toPusherKey(`user:${sessionId}:friends`))

      const newFriendHandler=()=>{
        router.refresh()
      }

      const chatHandler=(message: ExtendedMessage)=>{
       const shouldNotify= pathName !== `/dashboard/chats/${chatHrefConstructor(sessionId,message.senderId)}`
       if(!shouldNotify) return

       //should be notified
       toast.custom((t)=> 
        //custom component
        <UnSeenChatToast senderId={message.senderId}
         senderImg={message.senderImg}
          senderMessage={message.text} 
        senderName={message.senderName}
         sessionId={sessionId}
         t={t} />
       )
       setUnSeenMessages((prev)=> [...prev, message])
      }

      pusherClient.bind('new_message', chatHandler)
      pusherClient.bind('new_friend', newFriendHandler)

      return () => {
        pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:chats`))
      pusherClient.unsubscribe(toPusherKey(`user:${sessionId}:friends`))
      pusherClient.unbind('new_message', chatHandler)
      pusherClient.unbind('new_friend', newFriendHandler)
      }
    }, [pathName, sessionId, router])
    
    useEffect(() => {
        //checking if pathnamename includes? if it has we are setting the messages to filtered ids of the masseges of the senderid
      if(pathName?.includes('chat')){
        setUnSeenMessages((prev)=>{
            return prev.filter((msg)=> !pathName.includes(msg.senderId))
        })
      }
    }, [pathName])
    
  return <ul role='list' className='max-h-[25rem] overflow-y-auto -mx-2 space-y-1'>
    {friends.sort().map((friend)=>{

        //counting here how many unseen messages are there for this particular friend
       const unSeenMessagesCount= unSeenMessages.filter((unseenMsg)=>{
            return unseenMsg.senderId === friend.id
        }).length

        return(<li key={friend.id}>
            <a href={`/dashboard/chats/${chatHrefConstructor(sessionId, friend.id)}`} className='flex gap-5 items-center py-5 px-5 rounded-md border-[0.5px] hover:bg-zinc-50'>
            <div className="relative h-10 w-10 bg-gray-50">
                <Image src={friend.image} alt={`friend profile image`} fill
                  referrerPolicy='no-referrer'
                  className='rounded-full'
                />
              </div>
              <div className='space-y-2'>
                <p className='text-slate-400 font-semibold text-sm'>{friend.name}</p>
                <p className='text-slate-300 font-medium text-xs'>{friend.email}</p>
              </div>
              {unSeenMessagesCount > 0 && <p className='rounded-full bg-indigo-700 text-white w-[1.25rem] h-5 text-sm flex justify-center items-center'>
                {unSeenMessagesCount}
                </p>}
            </a>
        </li>)
    })}
  </ul>
}

export default ChatList