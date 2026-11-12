"use client"
import Image from 'next/image'
import { FC, useEffect, useRef, useState } from 'react'
import Messages from './Messages'
import ChatInput from './ChatInput'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { Search, X } from 'lucide-react'

interface ChatProps {
  chatPartner: User
  initialMessages: Message[]
  sessionId: string
  chatId: string
  sessionImg: string
}

const Chat: FC<ChatProps> = ({ chatPartner, initialMessages, sessionId, chatId, sessionImg }) => {
  const [isPartnerOnline, setIsPartnerOnline] = useState<boolean>(false)
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // 1. Presence channel for tracking active partner in chat room
    const presenceChannelKey = toPusherKey(`presence-chat:${chatId}`)
    const presenceChannel = pusherClient.subscribe(presenceChannelKey) as any

    presenceChannel.bind('pusher:subscription_succeeded', (members: any) => {
      setIsPartnerOnline(Boolean(members.get(chatPartner.id)))
    })

    presenceChannel.bind('pusher:member_added', (member: any) => {
      if (member.id === chatPartner.id) {
        setIsPartnerOnline(true)
      }
    })

    presenceChannel.bind('pusher:member_removed', (member: any) => {
      if (member.id === chatPartner.id) {
        setIsPartnerOnline(false)
      }
    })

    // 2. Private channel for typing indicators
    const privateChannelKey = toPusherKey(`private-chat:${chatId}`)
    const privateChannel = pusherClient.subscribe(privateChannelKey)

    const typingHandler = ({ userId, isTyping: typingState }: { userId: string; isTyping: boolean }) => {
      if (userId === chatPartner.id) {
        setIsTyping(typingState)

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current)
        }

        if (typingState) {
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false)
          }, 3000)
        }
      }
    }

    privateChannel.bind('user_typing', typingHandler)

    return () => {
      pusherClient.unsubscribe(presenceChannelKey)
      pusherClient.unsubscribe(privateChannelKey)
      privateChannel.unbind('user_typing', typingHandler)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [chatId, chatPartner.id])

  return (
    <div className='flex flex-1 justify-between flex-col h-full max-h-[calc(100vh-6rem)]'>
      {/* Header */}
      <div className='flex sm:items-center justify-between py-3 border-b-2 border-gray-200 dark:border-zinc-800 px-5 bg-white dark:bg-zinc-900'>
        <div className='relative flex items-center space-x-4'>
          <div className='relative'>
            <div className='relative w-9 sm:w-12 h-9 sm:h-12'>
              <Image
                src={chatPartner.image}
                alt={`${chatPartner.name} profile image`}
                fill
                referrerPolicy='no-referrer'
                className='rounded-full'
              />
            </div>
            {/* Real-time online indicator dot */}
            <span
              className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                isPartnerOnline ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-600'
              }`}
              title={isPartnerOnline ? 'Online' : 'Offline'}
            />
          </div>
          <div className='flex flex-col leading-tight'>
            <div className='text-lg sm:text-xl flex items-center'>
              <span className='text-gray-800 dark:text-gray-100 mr-3 font-semibold'>
                {chatPartner.name}
              </span>
            </div>
            <div className='text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5'>
              {isTyping ? (
                <span className='text-indigo-600 dark:text-indigo-400 font-medium animate-pulse flex items-center gap-1'>
                  typing
                  <span className='inline-flex'>
                    <span className='animate-bounce'>.</span>
                    <span className='animate-bounce [animation-delay:0.2s]'>.</span>
                    <span className='animate-bounce [animation-delay:0.4s]'>.</span>
                  </span>
                </span>
              ) : isPartnerOnline ? (
                <span className='text-emerald-600 dark:text-emerald-400 font-medium'>Online</span>
              ) : (
                <span>Offline</span>
              )}
            </div>
          </div>
        </div>

        {/* Search Toggle Button & Input */}
        <div className='flex items-center gap-2'>
          {isSearchOpen ? (
            <div className='flex items-center gap-1.5 bg-gray-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full'>
              <Search size={15} className='text-gray-400' />
              <input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search in chat...'
                className='bg-transparent border-0 focus:ring-0 text-xs text-gray-800 dark:text-gray-100 placeholder:text-gray-400 p-0 w-32 sm:w-48'
                autoFocus
              />
              <button
                onClick={() => {
                  setIsSearchOpen(false)
                  setSearchQuery('')
                }}
                className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchOpen(true)}
              className='p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-colors'
              title='Search in conversation'
            >
              <Search size={18} />
            </button>
          )}
        </div>
      </div>

      <Messages
        initialMessages={initialMessages}
        sessionId={sessionId}
        sessionImg={sessionImg}
        chatPartner={chatPartner}
        chatId={chatId}
        isPartnerTyping={isTyping}
        highlightQuery={searchQuery}
      />
      <ChatInput chatPartner={chatPartner.name} chatId={chatId} />
    </div>
  )
}

export default Chat
