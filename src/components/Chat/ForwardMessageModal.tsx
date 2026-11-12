'use client'

import { Avatar, Button } from '@/common'
import { chatHrefConstructor } from '@/lib/utils'
import axios from 'axios'
import {
  Check,
  FileText,
  Film,
  Forward,
  Loader2,
  Mic,
  Music,
  Search,
  Users,
  Video,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { FC, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

interface ForwardMessageModalProps {
  isOpen: boolean
  onClose: () => void
  message: Message | null
  sessionId: string
  currentChatId?: string
}

interface ForwardTarget {
  id: string
  chatId: string
  name: string
  image?: string
  subtitle: string
  isGroup: boolean
}

export const ForwardMessageModal: FC<ForwardMessageModalProps> = ({
  isOpen,
  onClose,
  message,
  sessionId,
  currentChatId,
}) => {
  const [friends, setFriends] = useState<User[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [forwardingMap, setForwardingMap] = useState<Record<string, 'loading' | 'sent'>>({})

  // Fetch user's friends and groups when modal opens
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setIsLoadingList(true)
    setForwardingMap({})
    setSearchQuery('')

    Promise.allSettled([
      axios.get<User[]>('/api/friends/list'),
      axios.get<Group[]>('/api/group/list'),
    ])
      .then(([friendsRes, groupsRes]) => {
        if (!isMounted) return
        if (friendsRes.status === 'fulfilled') {
          setFriends(friendsRes.value.data || [])
        }
        if (groupsRes.status === 'fulfilled') {
          setGroups(groupsRes.value.data || [])
        }
      })
      .catch((err) => {
        console.error('Failed to load forwarding targets:', err)
      })
      .finally(() => {
        if (isMounted) setIsLoadingList(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen])

  // Map into a unified searchable list
  const targets: ForwardTarget[] = useMemo(() => {
    const list: ForwardTarget[] = []

    // 1. Direct friends
    for (const friend of friends) {
      const targetChatId = chatHrefConstructor(sessionId, friend.id)
      list.push({
        id: friend.id,
        chatId: targetChatId,
        name: friend.name || friend.email || 'Friend',
        image: friend.image,
        subtitle: friend.email || 'Direct Chat',
        isGroup: false,
      })
    }

    // 2. Groups
    for (const group of groups) {
      list.push({
        id: group.id,
        chatId: `group--${group.id}`,
        name: group.name,
        image: group.image,
        subtitle: `${group.memberIds?.length || 0} members`,
        isGroup: true,
      })
    }

    return list
  }, [friends, groups, sessionId])

  // Filtered by search query and excluding current chat if desired
  const filteredTargets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return targets.filter((t) => {
      if (currentChatId && t.chatId === currentChatId) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q)
      )
    })
  }, [targets, searchQuery, currentChatId])

  if (!isOpen || !message) return null

  const handleForwardTo = async (target: ForwardTarget) => {
    if (forwardingMap[target.chatId] === 'loading' || forwardingMap[target.chatId] === 'sent') {
      return
    }

    setForwardingMap((prev) => ({ ...prev, [target.chatId]: 'loading' }))

    try {
      await axios.post('/api/message/send', {
        chatId: target.chatId,
        text: message.text || '',
        mediaUrl: message.mediaUrl,
        mediaType: message.mediaType,
        fileName: message.fileName,
        fileSize: message.fileSize,
        duration: message.duration,
      })

      setForwardingMap((prev) => ({ ...prev, [target.chatId]: 'sent' }))
      toast.success(`Forwarded to ${target.name}`)
    } catch (err: any) {
      console.error('Forwarding error:', err)
      toast.error(err?.response?.data || `Failed to forward to ${target.name}`)
      setForwardingMap((prev) => {
        const next = { ...prev }
        delete next[target.chatId]
        return next
      })
    }
  }

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-labelledby='forward-modal-title'
      className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200'
    >
      <div className='relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]'>
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800'>
          <div className='flex items-center gap-2.5'>
            <div className='p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'>
              <Forward size={18} aria-hidden='true' />
            </div>
            <div>
              <h3 id='forward-modal-title' className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                Forward Message
              </h3>
              <p className='text-xs text-gray-500 dark:text-gray-400'>
                Select friends or groups to send this message to
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition'
            aria-label='Close modal'
          >
            <X size={18} aria-hidden='true' />
          </button>
        </div>

        {/* Message Snippet Preview */}
        <div className='px-6 pt-3 pb-2 bg-gray-50/80 dark:bg-zinc-900/40 border-b border-gray-100 dark:border-zinc-800/80 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2.5'>
          <span className='font-medium text-gray-400 text-[11px] shrink-0 uppercase tracking-wider'>
            Forwarding:
          </span>
          <div className='flex items-center gap-2 truncate'>
            {message.mediaType === 'image' && message.mediaUrl && (
              <div className='relative h-6 w-6 rounded overflow-hidden shrink-0'>
                <Image src={message.mediaUrl} alt='Thumbnail' fill className='object-cover' />
              </div>
            )}
            {message.mediaType === 'audio' && (
              <span className='flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium'>
                <Mic size={13} aria-hidden='true' /> Voice note
              </span>
            )}
            {message.mediaType === 'video-note' && (
              <span className='flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium'>
                <Video size={13} aria-hidden='true' /> Video note
              </span>
            )}
            {message.mediaType === 'video' && (
              <span className='flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium'>
                <Film size={13} aria-hidden='true' /> Video
              </span>
            )}
            {message.mediaType === 'file' && (
              <span className='flex items-center gap-1 text-gray-600 dark:text-gray-300 font-medium truncate'>
                <FileText size={13} aria-hidden='true' /> {message.fileName || 'File'}
              </span>
            )}
            <span className='truncate text-gray-800 dark:text-gray-200'>
              {message.text ? `"${message.text}"` : !message.mediaType ? 'Message' : ''}
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className='px-6 py-3 border-b border-gray-100 dark:border-zinc-800'>
          <div className='relative'>
            <Search size={15} className='absolute left-3.5 top-3 text-gray-400' aria-hidden='true' />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search friends or groups...'
              aria-label='Search friends or groups'
              className='w-full rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/70 py-2 pl-9 pr-9 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600'
            />
            {searchQuery && (
              <button
                type='button'
                onClick={() => setSearchQuery('')}
                className='absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                aria-label='Clear search'
              >
                <X size={15} aria-hidden='true' />
              </button>
            )}
          </div>
        </div>

        {/* Targets List */}
        <div className='flex-1 overflow-y-auto px-6 py-2 space-y-1.5 min-h-[14rem] max-h-72'>
          {isLoadingList ? (
            <div className='flex flex-col items-center justify-center py-12 text-gray-400'>
              <Loader2 size={24} className='animate-spin text-indigo-600 mb-2' aria-hidden='true' />
              <p className='text-xs'>Loading conversations...</p>
            </div>
          ) : filteredTargets.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 text-center text-gray-400 px-4'>
              <p className='text-xs font-medium text-gray-600 dark:text-gray-400'>
                {searchQuery ? `No chats matching "${searchQuery}"` : 'No other chats found'}
              </p>
              <p className='text-[11px] text-gray-400 mt-1'>
                Add friends or join groups to forward messages
              </p>
            </div>
          ) : (
            filteredTargets.map((target) => {
              const status = forwardingMap[target.chatId]
              return (
                <div
                  key={target.chatId}
                  className='flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-zinc-800'
                >
                  <div className='flex items-center gap-3 min-w-0 mr-3'>
                    {target.isGroup ? (
                      <div className='relative w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0'>
                        <Users size={18} aria-hidden='true' />
                      </div>
                    ) : (
                      <Avatar
                        src={target.image}
                        name={target.name}
                        sizeClassName='w-10 h-10'
                        textClassName='text-xs font-bold text-white'
                      />
                    )}
                    <div className='min-w-0 truncate'>
                      <p className='text-xs font-semibold text-gray-900 dark:text-gray-100 truncate'>
                        {target.name}
                      </p>
                      <p className='text-[11px] text-gray-400 truncate'>
                        {target.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className='shrink-0'>
                    {status === 'sent' ? (
                      <span className='inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-lg'>
                        <Check size={13} aria-hidden='true' /> Sent
                      </span>
                    ) : (
                      <Button
                        size='sm'
                        onClick={() => handleForwardTo(target)}
                        isLoading={status === 'loading'}
                        disabled={status === 'loading'}
                        className='h-7 px-3 text-xs flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white'
                        aria-label={`Forward message to ${target.name}`}
                      >
                        <Forward size={12} aria-hidden='true' />
                        <span>Send</span>
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className='px-6 py-3 border-t border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900 flex justify-end'>
          <Button variant='ghost' size='sm' onClick={onClose} className='text-xs px-4'>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ForwardMessageModal

