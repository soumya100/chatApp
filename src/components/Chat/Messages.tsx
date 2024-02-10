import { cn, toPusherKey } from '@/lib/utils'
import { Session } from 'next-auth'
import { FC, useEffect, useRef, useState } from 'react'
import {format} from 'date-fns'
import Image from 'next/image'
import { pusherClient } from '@/lib/pusher'

interface MessagesProps {
  initialMessages: Message[]
  sessionId: string,
  sessionImg: string,
  chatPartner: User,
  chatId: string
}



const Messages: FC<MessagesProps> = ({ initialMessages, sessionId, sessionImg ,chatPartner, chatId}) => {

  const [messages, setMessages]= useState<Message[]>(initialMessages)
  const scrollDownRef= useRef<HTMLDivElement | null>(null) 

  const formatTimeStamp=(timeStamp: number)=>{
    return format(timeStamp, 'HH:mm')
  }

  useEffect(()=>{
    pusherClient.subscribe(
        toPusherKey(`chat:${chatId}`) //listening to the changes
      )

      const messageHandler=(message: Message)=>{
        setMessages(prev=> [message, ...prev])
      }

      pusherClient.bind('incoming-message', messageHandler) // telling pusher what to do when the changes occurs


      return()=> {
        //cleaning up the events for optimising performances
        pusherClient.unsubscribe(toPusherKey(`chat:${chatId}`))
        pusherClient.unbind('incoming-message', messageHandler)
      }

},[chatId])

  return <div id='messages' className='flex h-full flex-1 flex-col-reverse gap-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch'>
    <div ref={scrollDownRef}/>
    {messages.map((message, idx)=>{
      const isCurrentUser= message.senderId === sessionId

      const hasNextMsgFromSameUser= messages[idx-1]?.senderId === messages[idx].senderId

      return<div id={`chat-message`} key={`${message.id}-${message.timestamp}`}>
          <div className={cn('flex items-end', {
            'justify-end' : isCurrentUser,  //if it is curremt user the justify-end classname will be added
          })}>
            <div className={cn('flex flex-col space-y-2 text-base max-w-xs mx-2',{
              'order-1 items-end': isCurrentUser,
              'order-2 items-start': !isCurrentUser
            })}>
              <p className={cn('px-4 py-2 rounded-lg inline-block',{
                'bg-indigo-600 text-white': isCurrentUser,
                'bg-gray-200 text-gray-900': !isCurrentUser,
                'rounded-br-none': !hasNextMsgFromSameUser && isCurrentUser,
                'rounded-bl-none': !hasNextMsgFromSameUser && !isCurrentUser,
              })}>
                {message.text}{' '}
                <span className='ml-2 text-xs text-gray-400'>
                  {formatTimeStamp(message.timestamp)}
                </span>
              </p>
            </div>

            <div className={cn('relative w-6 h-6', {
              'order-2': isCurrentUser,
              'order-1': !isCurrentUser,
              'invisible': hasNextMsgFromSameUser
            })}>
              <Image src={isCurrentUser ? (sessionImg as string) : chatPartner.image} 
              alt={''}
              referrerPolicy='no-referrer'
              className='rounded-full'
              fill
              />
            </div>
          </div>
        </div>
    })}
  </div>
}

export default Messages