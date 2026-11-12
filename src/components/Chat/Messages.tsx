import { cn, toPusherKey } from '@/lib/utils'
import { FC, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import Image from 'next/image'
import { pusherClient } from '@/lib/pusher'
import { Check, Download, Edit2, FileText, Loader2, Smile, Trash2, X } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

interface MessagesProps {
  initialMessages: Message[]
  sessionId: string
  sessionImg: string
  chatPartner: User
  chatId: string
  isPartnerTyping?: boolean
  highlightQuery?: string
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥']

const Messages: FC<MessagesProps> = ({
  initialMessages,
  sessionId,
  sessionImg,
  chatPartner,
  chatId,
  isPartnerTyping = false,
  highlightQuery = '',
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [hasMore, setHasMore] = useState<boolean>(initialMessages.length >= 30)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState<string>('')
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null)
  const scrollDownRef = useRef<HTMLDivElement | null>(null)
  const isInitialMount = useRef<boolean>(true)

  const formatTimeStamp = (timeStamp: number) => {
    return format(timeStamp, 'HH:mm')
  }

  // Auto-scroll on mount and on new messages
  useEffect(() => {
    if (isInitialMount.current) {
      scrollDownRef.current?.scrollIntoView({ behavior: 'auto' })
      isInitialMount.current = false
    }
  }, [])

  useEffect(() => {
    setMessages(initialMessages)
    setHasMore(initialMessages.length >= 30)
  }, [initialMessages])

  // Real-time Pusher event listeners
  useEffect(() => {
    const channelKey = toPusherKey(`private-chat:${chatId}`)
    const channel = pusherClient.subscribe(channelKey)

    // New incoming message
    const messageHandler = (message: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev
        return [message, ...prev]
      })
      scrollDownRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Message edited
    const editHandler = ({ messageId, text, isEdited }: { messageId: string; text: string; isEdited: boolean }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, text, isEdited } : msg))
      )
    }

    // Message deleted
    const deleteHandler = ({ messageId }: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, text: 'This message was deleted', isDeleted: true, mediaUrl: undefined } : msg
        )
      )
    }

    // Message reacted
    const reactHandler = ({
      messageId,
      reactions,
    }: {
      messageId: string
      reactions: Record<string, string[]>
    }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, reactions } : msg))
      )
    }

    channel.bind('incoming-message', messageHandler)
    channel.bind('message_edited', editHandler)
    channel.bind('message_deleted', deleteHandler)
    channel.bind('message_reacted', reactHandler)

    return () => {
      pusherClient.unsubscribe(channelKey)
      channel.unbind('incoming-message', messageHandler)
      channel.unbind('message_edited', editHandler)
      channel.unbind('message_deleted', deleteHandler)
      channel.unbind('message_reacted', reactHandler)
    }
  }, [chatId])

  // Load older messages for pagination
  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return

    const oldestMessage = messages[messages.length - 1]
    const cursor = oldestMessage?.timestamp

    setIsLoadingMore(true)
    try {
      const response = await axios.get<{ messages: Message[]; hasMore: boolean }>(
        `/api/message/history`,
        {
          params: {
            chatId,
            cursor,
            limit: 30,
          },
        }
      )

      const olderMessages = response.data.messages || []
      setMessages((prev) => [...prev, ...olderMessages])
      setHasMore(response.data.hasMore)
    } catch (error) {
      toast.error('Failed to load earlier messages')
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Handle message edit
  const submitEdit = async (messageId: string) => {
    const trimmed = editingText.trim()
    if (!trimmed) return

    try {
      await axios.post('/api/message/edit', {
        messageId,
        chatId,
        newText: trimmed,
      })
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, text: trimmed, isEdited: true } : msg))
      )
      setEditingMessageId(null)
      toast.success('Message updated')
    } catch (error: any) {
      toast.error(error?.response?.data || 'Failed to edit message')
    }
  }

  // Handle message delete
  const submitDelete = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return

    try {
      await axios.post('/api/message/delete', {
        messageId,
        chatId,
      })
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, text: 'This message was deleted', isDeleted: true, mediaUrl: undefined } : msg
        )
      )
      toast.success('Message deleted')
    } catch (error: any) {
      toast.error(error?.response?.data || 'Failed to delete message')
    }
  }

  // Handle emoji reaction toggle
  const toggleReaction = async (messageId: string, emoji: string) => {
    setActiveReactionPickerId(null)
    try {
      const response = await axios.post<{ reactions: Record<string, string[]> }>(
        '/api/message/react',
        {
          messageId,
          chatId,
          emoji,
        }
      )

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, reactions: response.data.reactions } : msg
        )
      )
    } catch (error: any) {
      toast.error(error?.response?.data || 'Failed to update reaction')
    }
  }

  return (
    <div
      id='messages'
      className='flex h-full flex-1 flex-col-reverse gap-4 p-4 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch'
    >
      <div ref={scrollDownRef} />

      {/* Typing Bubble */}
      {isPartnerTyping && (
        <div className='flex items-end gap-2'>
          <div className='relative w-6 h-6'>
            <Image
              src={chatPartner.image}
              alt={`${chatPartner.name}'s profile`}
              referrerPolicy='no-referrer'
              className='rounded-full'
              fill
            />
          </div>
          <div className='rounded-2xl rounded-bl-none bg-gray-200 dark:bg-zinc-800 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1.5 shadow-xs'>
            <span className='h-2 w-2 rounded-full bg-gray-400 animate-bounce' />
            <span className='h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0.2s]' />
            <span className='h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0.4s]' />
          </div>
        </div>
      )}

      {/* Message List */}
      {messages.map((message, idx) => {
        const isCurrentUser = message.senderId === sessionId
        const hasNextMsgFromSameUser = messages[idx - 1]?.senderId === messages[idx].senderId
        const isEditingThisMessage = editingMessageId === message.id
        const isReactionPickerOpen = activeReactionPickerId === message.id
        const reactions = message.reactions || {}
        const isMatch = highlightQuery && message.text?.toLowerCase().includes(highlightQuery.toLowerCase())

        return (
          <div key={`${message.id}-${message.timestamp}`} className={cn('group relative', {
            'ring-2 ring-yellow-400/80 rounded-2xl p-1 bg-yellow-50/20': isMatch
          })}>
            <div
              className={cn('flex items-end', {
                'justify-end': isCurrentUser,
              })}
            >
              <div
                className={cn('flex flex-col space-y-1.5 text-base max-w-sm sm:max-w-md mx-2', {
                  'order-1 items-end': isCurrentUser,
                  'order-2 items-start': !isCurrentUser,
                })}
              >
                {/* Action Toolbar on Hover */}
                {!message.isDeleted && (
                  <div
                    className={cn(
                      'opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pb-1 text-gray-400',
                      {
                        'justify-end': isCurrentUser,
                        'justify-start': !isCurrentUser,
                      }
                    )}
                  >
                    {/* Quick emoji reaction toggle button */}
                    <div className='relative'>
                      <button
                        onClick={() =>
                          setActiveReactionPickerId(isReactionPickerOpen ? null : message.id)
                        }
                        className='p-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        title='React with emoji'
                      >
                        <Smile size={15} />
                      </button>

                      {/* Popover Reaction Bar */}
                      {isReactionPickerOpen && (
                        <div className='absolute bottom-full mb-1 z-30 flex items-center gap-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-full shadow-lg px-2 py-1'>
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(message.id, emoji)}
                              className='hover:scale-125 transition-transform text-base px-1'
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Edit button (Sender only) */}
                    {isCurrentUser && (
                      <button
                        onClick={() => {
                          setEditingMessageId(message.id)
                          setEditingText(message.text)
                        }}
                        className='p-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        title='Edit message'
                      >
                        <Edit2 size={14} />
                      </button>
                    )}

                    {/* Delete button (Sender only) */}
                    {isCurrentUser && (
                      <button
                        onClick={() => submitDelete(message.id)}
                        className='p-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-red-500 hover:text-red-700'
                        title='Delete message'
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}

                {/* Message Bubble or Inline Edit */}
                {isEditingThisMessage ? (
                  <div className='flex items-center gap-2 bg-white dark:bg-zinc-800 p-2 border border-indigo-400 rounded-lg shadow-xs'>
                    <input
                      type='text'
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitEdit(message.id)
                        if (e.key === 'Escape') setEditingMessageId(null)
                      }}
                      className='text-sm text-gray-900 dark:text-gray-100 bg-transparent border-0 focus:ring-0 p-1 w-64'
                      autoFocus
                    />
                    <button
                      onClick={() => submitEdit(message.id)}
                      className='p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700'
                      title='Save'
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingMessageId(null)}
                      className='p-1 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
                      title='Cancel'
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div
                    className={cn('px-4 py-2.5 rounded-2xl inline-block shadow-xs', {
                      'bg-indigo-600 text-white': isCurrentUser && !message.isDeleted,
                      'bg-gray-200 dark:bg-zinc-800 text-gray-900 dark:text-gray-100': !isCurrentUser && !message.isDeleted,
                      'bg-gray-100 dark:bg-zinc-900 text-gray-500 italic border border-gray-200 dark:border-zinc-800': message.isDeleted,
                      'rounded-br-none': !hasNextMsgFromSameUser && isCurrentUser,
                      'rounded-bl-none': !hasNextMsgFromSameUser && !isCurrentUser,
                    })}
                  >
                    {/* Media Attachment Rendering */}
                    {message.mediaUrl && !message.isDeleted && (
                      <div className='mb-2'>
                        {message.mediaType === 'image' ? (
                          <a
                            href={message.mediaUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='block overflow-hidden rounded-lg max-w-xs'
                          >
                            <img
                              src={message.mediaUrl}
                              alt='Attached image'
                              className='rounded-lg max-h-60 w-auto object-cover hover:opacity-95 transition-opacity'
                              loading='lazy'
                            />
                          </a>
                        ) : (
                          <a
                            href={message.mediaUrl}
                            download={message.fileName || 'download'}
                            className={cn(
                              'flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-medium',
                              isCurrentUser
                                ? 'bg-indigo-700/60 border-indigo-500/40 text-white hover:bg-indigo-700'
                                : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50'
                            )}
                          >
                            <FileText size={20} className='shrink-0' />
                            <div className='truncate max-w-[12rem]'>
                              <p className='truncate'>{message.fileName || 'Document'}</p>
                              {message.fileSize && (
                                <p className='text-[0.65rem] opacity-75'>
                                  {(message.fileSize / 1024).toFixed(1)} KB
                                </p>
                              )}
                            </div>
                            <Download size={16} className='ml-auto shrink-0 opacity-80' />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Text Content */}
                    {message.text && (
                      <p className='break-words leading-relaxed'>
                        {message.text}
                        {message.isEdited && !message.isDeleted && (
                          <span className='ml-1.5 text-[0.65rem] opacity-75'>(edited)</span>
                        )}
                        <span
                          className={cn('ml-2 text-xs', {
                            'text-indigo-200': isCurrentUser && !message.isDeleted,
                            'text-gray-400': !isCurrentUser || message.isDeleted,
                          })}
                        >
                          {formatTimeStamp(message.timestamp)}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* Emoji Reaction Badges */}
                {Object.keys(reactions).length > 0 && !message.isDeleted && (
                  <div className='flex flex-wrap gap-1 mt-1'>
                    {Object.entries(reactions).map(([emoji, userIds]) => {
                      const userReacted = userIds.includes(sessionId)
                      return (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(message.id, emoji)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-colors shadow-2xs',
                            {
                              'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-medium':
                                userReacted,
                              'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50':
                                !userReacted,
                            }
                          )}
                          title={`${userIds.length} reaction${userIds.length > 1 ? 's' : ''}`}
                        >
                          <span>{emoji}</span>
                          <span className='text-[0.65rem]'>{userIds.length}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Avatar */}
              <div
                className={cn('relative w-6 h-6', {
                  'order-2': isCurrentUser,
                  'order-1': !isCurrentUser,
                  invisible: hasNextMsgFromSameUser,
                })}
              >
                <Image
                  src={isCurrentUser ? (sessionImg as string) : chatPartner.image}
                  alt={isCurrentUser ? 'Your profile' : `${chatPartner.name}'s profile`}
                  referrerPolicy='no-referrer'
                  className='rounded-full'
                  fill
                />
              </div>
            </div>
          </div>
        )
      })}

      {/* Load Earlier Messages Button */}
      {hasMore && (
        <div className='flex justify-center py-2'>
          <button
            onClick={loadMoreMessages}
            disabled={isLoadingMore}
            className='inline-flex items-center gap-2 rounded-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-xs hover:bg-gray-50 dark:hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50'
          >
            {isLoadingMore ? (
              <>
                <Loader2 className='h-3 w-3 animate-spin text-indigo-600' />
                Loading older messages...
              </>
            ) : (
              'Load earlier messages'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export default Messages
