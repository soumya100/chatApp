'use client'
import { cn } from '@/lib/utils'
import { Session } from 'next-auth'
import { FC, useRef, useState } from 'react'

interface MessagesProps {
  initialMessages: Message[]
  sessionId: string
}

const Messages: FC<MessagesProps> = ({ initialMessages, sessionId}) => {

  const [messages, setMessages]= useState<Message[]>(initialMessages)
  const scrollDownRef= useRef<HTMLDivElement | null>(null) 

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
                'bg-grey-200 text-grey-900': !isCurrentUser,
                'rounded-br-none': !hasNextMsgFromSameUser && isCurrentUser,
                'rounded-bl-none': !hasNextMsgFromSameUser && !isCurrentUser,
              })}>
                {message.text}{' '}
                <span className='ml-2 text-xs text-gray-400'>
                  {message.timestamp}
                </span>
              </p>
            </div>
          </div>
        </div>
    })}
  </div>
}

export default Messages