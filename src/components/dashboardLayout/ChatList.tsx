"use client"
import { Avatar, UnSeenChatToast } from '@/common'
import { pusherClient } from '@/lib/pusher'
import { chatHrefConstructor, cn, toPusherKey } from '@/lib/utils'
import axios from 'axios'
import { Bell, Search, Users } from 'lucide-react'
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
  const [groups, setGroups] = useState<Group[]>([])
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [notificationPermission, setNotificationPermission] = useState<string | null>(null)

  // Track browser notification permission status
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission)
    }
  }, [])

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission()
        setNotificationPermission(perm)
        if (perm === 'granted') {
          toast.success('Browser notifications enabled!')
        }
      } catch (err) {
        console.error('Notification permission error:', err)
      }
    }
  }

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08)
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.3)
    } catch {}
  }

  // Fetch user groups
  useEffect(() => {
    axios
      .get<Group[]>('/api/group/list')
      .then((res) => {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray((res.data as any)?.groups)
          ? (res.data as any).groups
          : []
        setGroups(list)
      })
      .catch((err) => {
        console.error('Failed to load groups:', err)
      })
  }, [])

  useEffect(() => {
    setActiveChats(friends)
  }, [friends])

  useEffect(() => {
    setUnreadCounts(initialUnreadCounts)
  }, [initialUnreadCounts])

  useEffect(() => {
    // 1. Private channels for personal messages, friendship updates & groups
    const chatsChannel = toPusherKey(`private-user:${sessionId}:chats`)
    const friendsChannel = toPusherKey(`private-user:${sessionId}:friends`)
    const groupsChannel = toPusherKey(`private-user:${sessionId}:groups`)

    pusherClient.subscribe(chatsChannel)
    pusherClient.subscribe(friendsChannel)
    pusherClient.subscribe(groupsChannel)

    const newFriendHandler = (newFriend: User) => {
      setActiveChats((prev) => {
        if (prev.some((f) => f.id === newFriend.id)) return prev
        return [...prev, newFriend]
      })
    }

    const newGroupHandler = (newGroup: Group) => {
      setGroups((prev) => {
        if (prev.some((g) => g.id === newGroup.id)) return prev
        return [newGroup, ...prev]
      })
    }

    const chatHandler = (message: ExtendedMessage) => {
      const isGroup = message.receiverId?.startsWith('group--')
      const chatId = isGroup ? message.receiverId : chatHrefConstructor(sessionId, message.senderId)
      const isCurrentlyViewingChat = pathName === `/dashboard/chats/${chatId}`

      if (!isCurrentlyViewingChat) {
        // Increment unread count for this conversation in real time
        setUnreadCounts((prev) => ({
          ...prev,
          [chatId]: (Number(prev[chatId]) || 0) + 1,
        }))

        // Play gentle audio chime
        playNotificationSound()

        const msgBody =
          message.text ||
          (message.mediaType ? `Sent an attachment (${message.mediaType})` : 'New message')

        // 1. Show interactive in-browser toast with instant reply support
        toast.custom((t) => (
          <UnSeenChatToast
            senderId={message.senderId}
            senderImg={message.senderImg}
            senderMessage={msgBody}
            senderName={message.senderName}
            sessionId={sessionId}
            chatId={chatId}
            t={t}
          />
        ))

        // 2. Native OS / Browser Notification (fires even when tab is backgrounded)
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            const notif = new Notification(message.senderName || 'New Message', {
              body: msgBody,
              icon: message.senderImg || '/favicon.ico',
              tag: chatId,
            })
            notif.onclick = () => {
              window.focus()
              router.push(`/dashboard/chats/${chatId}`)
              notif.close()
            }
          } catch (err) {
            console.error('Browser Notification error:', err)
          }
        }
      }
    }

    pusherClient.bind('new_message', chatHandler)
    pusherClient.bind('new_friend', newFriendHandler)
    pusherClient.bind('new_group', newGroupHandler)

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
      pusherClient.unsubscribe(groupsChannel)
      pusherClient.unsubscribe(presenceChannelKey)
      pusherClient.unbind('new_message', chatHandler)
      pusherClient.unbind('new_friend', newFriendHandler)
      pusherClient.unbind('new_group', newGroupHandler)
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
        const query = searchFilter.toLowerCase().trim()
        const nameClean = friend.name?.toLowerCase() || ''
        const emailClean = friend.email?.toLowerCase() || ''
        return (
          nameClean.includes(query) ||
          nameClean.replace(/\s+/g, '').includes(query) ||
          emailClean.includes(query)
        )
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [activeChats, searchFilter])

  const filteredGroups = useMemo(() => {
    return groups
      .filter((group) => {
        if (!searchFilter.trim()) return true
        const query = searchFilter.toLowerCase().trim()
        const nameClean = group.name?.toLowerCase() || ''
        const descClean = group.description?.toLowerCase() || ''
        return nameClean.includes(query) || descClean.includes(query)
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [groups, searchFilter])

  const hasAnyChats = activeChats.length > 0 || groups.length > 0

  return (
    <div className='flex flex-col gap-2'>
      {/* Browser Notification Permission Banner */}
      {notificationPermission === 'default' && (
        <div className='mx-1 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-xs'>
          <div className='flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-medium truncate'>
            <Bell size={13} className='shrink-0' />
            <span className='truncate'>Enable browser notifications</span>
          </div>
          <button
            type='button'
            onClick={requestNotificationPermission}
            className='px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] shrink-0 ml-1.5 shadow-xs'
          >
            Allow
          </button>
        </div>
      )}

      {/* Search Input for filtering chats and groups */}
      {hasAnyChats && (
        <div className='relative px-1'>
          <Search size={14} className='absolute left-3.5 top-2.5 text-gray-400' />
          <input
            type='text'
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder='Search chats or groups...'
            className='w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/80 py-1.5 pl-8 pr-2 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
          />
        </div>
      )}

      <div className='max-h-[25rem] overflow-y-auto overflow-x-hidden -mx-2 space-y-3 px-1'>
        {/* Groups Section */}
        {filteredGroups.length > 0 && (
          <div>
            <div className='flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider'>
              <Users size={12} className='text-indigo-500' />
              <span>Groups ({filteredGroups.length})</span>
            </div>
            <ul role='list' className='space-y-1'>
              {filteredGroups.map((group) => {
                const groupChatId = `group--${group.id}`
                const unSeenMessagesCount = Number(unreadCounts[groupChatId]) || 0
                const isCurrentActive = pathName === `/dashboard/chats/${groupChatId}`

                return (
                  <li key={group.id}>
                    <Link
                      href={`/dashboard/chats/${groupChatId}`}
                      className={cn(
                        'flex gap-3 items-center py-2.5 px-2.5 rounded-lg border transition-all',
                        isCurrentActive
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60'
                          : 'border-transparent hover:border-gray-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                      )}
                    >
                      <div className='relative h-9 w-9 shrink-0'>
                        <Avatar
                          src={group.image}
                          name={group.name}
                          sizeClassName='w-9 h-9'
                          textClassName='text-xs font-bold text-white'
                        />
                        <span
                          className='absolute -bottom-1 -right-1 block p-0.5 rounded-full bg-indigo-600 text-white shadow-xs'
                          title='Group chat'
                        >
                          <Users size={10} />
                        </span>
                      </div>
                      <div className='space-y-0.5 min-w-0 flex-1 truncate'>
                        <p className='text-slate-800 dark:text-slate-200 font-semibold text-sm truncate'>
                          {group.name}
                        </p>
                        <p className='text-slate-400 dark:text-zinc-500 font-medium text-xs truncate'>
                          {group.memberIds?.length || 0} members
                        </p>
                      </div>
                      {unSeenMessagesCount > 0 && (
                        <p className='rounded-full bg-indigo-600 text-white min-w-[1.25rem] h-5 px-1.5 text-xs flex justify-center items-center font-medium ml-auto shrink-0'>
                          {unSeenMessagesCount}
                        </p>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Direct Friends Section */}
        <div>
          {filteredGroups.length > 0 && filteredChats.length > 0 && (
            <div className='px-2 py-1 text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider'>
              Direct Messages
            </div>
          )}
          <ul role='list' className='space-y-1'>
            {filteredChats.map((friend) => {
              const chatId = chatHrefConstructor(sessionId, friend.id)
              const unSeenMessagesCount = Number(unreadCounts[chatId]) || 0
              const isOnline = onlineUserIds.has(friend.id)
              const isCurrentActive = pathName === `/dashboard/chats/${chatId}`

              return (
                <li key={friend.id}>
                  <Link
                    href={`/dashboard/chats/${chatId}`}
                    className={cn(
                      'flex gap-3 items-center py-2.5 px-2.5 rounded-lg border transition-all',
                      isCurrentActive
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60'
                        : 'border-transparent hover:border-gray-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                    )}
                  >
                    <div className='relative h-9 w-9 shrink-0'>
                      <Avatar
                        src={friend.image}
                        name={friend.name}
                        sizeClassName='w-9 h-9'
                        textClassName='text-xs font-bold text-white'
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
                    <div className='space-y-0.5 min-w-0 flex-1 truncate'>
                      <p className='text-slate-800 dark:text-slate-200 font-semibold text-sm truncate'>
                        {friend.name}
                      </p>
                      <p className='text-slate-400 dark:text-zinc-500 font-medium text-xs truncate'>
                        {friend.email}
                      </p>
                    </div>
                    {unSeenMessagesCount > 0 && (
                      <p className='rounded-full bg-indigo-600 text-white min-w-[1.25rem] h-5 px-1.5 text-xs flex justify-center items-center font-medium ml-auto shrink-0'>
                        {unSeenMessagesCount}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ChatList
