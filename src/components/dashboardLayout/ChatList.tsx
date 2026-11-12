"use client"
import { UnSeenChatToast } from '@/common'
import { pusherClient } from '@/lib/pusher'
import { chatHrefConstructor, cn, toPusherKey } from '@/lib/utils'
import axios from 'axios'
import { Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FC, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

interface ChatListProps {
  friends: User[],
  sessionId: string,
  initialUnreadCounts?: Record<string, number>
}

interface ExtendedMessage extends Message {
  senderImg: string,
  senderName: string
}

const ChatList: FC<ChatListProps> = ({ friends, sessionId, initialUnreadCounts = {} }) => {
  const router = useRouter()
  const pathName = usePathname()
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(initialUnreadCounts)
  const [activeChats, setActiveChats] = useState<User[]>(friends)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [searchFilter, setSearchFilter] = useState<string>('')

  useEffect(() => {
    setActiveChats(friends)
  }, [friends])

  useEffect(() => {
    setUnreadCounts(initialUnreadCounts)
  }, [initialUnreadCounts])

  useEffect(() => {
    // 1. Private channels for personal messages & friendship updates
    const chatsChannel = toPusherKey(`private-user:${sessionId}:chats`)
    const friendsChannel = toPusherKey(`private-user:${sessionId}:friends`)

    pusherClient.subscribe(chatsChannel)
    pusherClient.subscribe(friendsChannel)

    const newFriendHandler = (newFriend: User) => {
      setActiveChats((prev) => {
        if (prev.some((f) => f.id === newFriend.id)) return prev
        return [...prev, newFriend]
      })
    }

    const chatHandler = (message: ExtendedMessage) => {
      const chatId = chatHrefConstructor(sessionId, message.senderId)
      const isCurrentlyViewingChat = pathName === `/dashboard/chats/${chatId}`

      if (!isCurrentlyViewingChat) {
        // Increment unread count for this conversation in real time
        setUnreadCounts((prev) => ({
          ...prev,
          [chatId]: (Number(prev[chatId]) || 0) + 1,
        }))

        // Show toast notification
        toast.custom((t) => (
          <UnSeenChatToast
            senderId={message.senderId}
            senderImg={message.senderImg}
            senderMessage={message.text}
            senderName={message.senderName}
            sessionId={sessionId}
            t={t}
          />
        ))
      }
    }

    pusherClient.bind('new_message', chatHandler)
    pusherClient.bind('new_friend', newFriendHandler)

    // 2. Global presence channel for active status
    const presenceChannelKey = toPusherKey('presence-online-users')
    const presenceChannel = pusherClient.subscribe(presenceChannelKey) as any

    presenceChannel.bind('pusher:subscription_succeeded', (members: any) => {
      const memberIds = new Set<string>()
      members.each((member: any) => memberIds.add(member.id))
      setOnlineUserIds(memberIds)
    })

    presenceChannel.bind('pusher:member_added', (member: any) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev)
        next.add(member.id)
        return next
      })
    })

    presenceChannel.bind('pusher:member_removed', (member: any) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev)
        next.delete(member.id)
        return next
      })
    })

    return () => {
      pusherClient.unsubscribe(chatsChannel)
      pusherClient.unsubscribe(friendsChannel)
      pusherClient.unsubscribe(presenceChannelKey)
      pusherClient.unbind('new_message', chatHandler)
      pusherClient.unbind('new_friend', newFriendHandler)
    }
  }, [pathName, sessionId, router])

  // Clear unread counts for the active chat and notify backend
  useEffect(() => {
    if (pathName?.startsWith('/dashboard/chats/')) {
      const activeChatId = pathName.split('/dashboard/chats/')[1]
      if (activeChatId && unreadCounts[activeChatId]) {
        setUnreadCounts((prev) => {
          const updated = { ...prev }
          delete updated[activeChatId]
          return updated
        })

        // Persist clearing to Redis
        axios.post('/api/message/read', { chatId: activeChatId }).catch(() => {})
      }
    }
  }, [pathName, unreadCounts])

  const filteredChats = useMemo(() => {
    return activeChats
      .filter((friend) => {
        if (!searchFilter.trim()) return true
        const query = searchFilter.toLowerCase()
        return (
          friend.name?.toLowerCase().includes(query) ||
          friend.email?.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [activeChats, searchFilter])

  return (
    <div className='flex flex-col gap-2'>
      {/* Search Input for filtering chats */}
      {activeChats.length > 2 && (
        <div className='relative px-1'>
          <Search size={14} className='absolute left-3.5 top-2.5 text-gray-400' />
          <input
            type='text'
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder='Search chats...'
            className='w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/80 py-1.5 pl-8 pr-2 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
          />
        </div>
      )}

      <ul role='list' className='max-h-[25rem] overflow-y-auto -mx-2 space-y-1'>
        {filteredChats.map((friend) => {
          const chatId = chatHrefConstructor(sessionId, friend.id)
          const unSeenMessagesCount = Number(unreadCounts[chatId]) || 0
          const isOnline = onlineUserIds.has(friend.id)

          return (
            <li key={friend.id}>
              <Link
                href={`/dashboard/chats/${chatId}`}
                className='flex gap-4 items-center py-3.5 px-3.5 rounded-md border-[0.5px] border-transparent hover:border-gray-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-all'
              >
                <div className='relative h-9 w-9 shrink-0 bg-gray-50 dark:bg-zinc-800'>
                  <Image
                    src={friend.image}
                    alt={`${friend.name} profile image`}
                    fill
                    referrerPolicy='no-referrer'
                    className='rounded-full'
                  />
                  {/* Real-time online indicator dot */}
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900',
                      isOnline ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-600'
                    )}
                    title={isOnline ? 'Online' : 'Offline'}
                  />
                </div>
                <div className='space-y-0.5 truncate'>
                  <p className='text-slate-800 dark:text-slate-200 font-semibold text-sm truncate'>
                    {friend.name}
                  </p>
                  <p className='text-slate-400 dark:text-zinc-500 font-medium text-xs truncate'>
                    {friend.email}
                  </p>
                </div>
                {unSeenMessagesCount > 0 && (
                  <p className='rounded-full bg-indigo-600 text-white min-w-[1.25rem] h-5 px-1.5 text-xs flex justify-center items-center font-medium ml-auto'>
                    {unSeenMessagesCount}
                  </p>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default ChatList
