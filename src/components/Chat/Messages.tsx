"use client"

import { Avatar, Button } from '@/common'
import { pusherClient } from '@/lib/pusher'
import { cn, toPusherKey } from '@/lib/utils'
import axios from 'axios'
import { format } from 'date-fns'
import {
  AlertCircle,
  Check,
  CheckCheck,
  Download,
  Edit2,
  FileText,
  Forward,
  Loader2,
  Pause,
  Play,
  Reply,
  RotateCcw,
  Smile,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { Dispatch, FC, SetStateAction, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import ForwardMessageModal from './ForwardMessageModal'

// Inline Audio Player for Voice Messages
const AudioPlayerMessage: FC<{
  src: string
  isCurrentUser: boolean
  initialDuration?: number
}> = ({ src, isCurrentUser, initialDuration }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState<number>(() => {
    return initialDuration && isFinite(initialDuration) && initialDuration > 0
      ? initialDuration
      : 0
  })
  const [playbackRate, setPlaybackRate] = useState(1)

  // Sync duration if initialDuration changes
  useEffect(() => {
    if (initialDuration && isFinite(initialDuration) && initialDuration > 0) {
      setDuration(initialDuration)
    }
  }, [initialDuration])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime
      if (isFinite(cur)) {
        setCurrentTime(cur)
      }
      const d = audioRef.current.duration
      if (typeof d === 'number' && isFinite(d) && !isNaN(d) && d > 0) {
        setDuration(d)
      } else if (duration === 0 && isFinite(cur) && cur > 0) {
        setDuration(cur)
      }
    }
  }

  const handleLoadedMetadata = () => {
    const audio = audioRef.current
    if (!audio) return

    const d = audio.duration
    if (typeof d === 'number' && isFinite(d) && !isNaN(d) && d > 0) {
      setDuration(d)
    } else if (d === Infinity) {
      // Chromium bug workaround: WebM audio streams recorded via MediaRecorder don't have
      // duration in the header, resulting in duration = Infinity.
      // Seeking to an arbitrary huge timestamp triggers Chromium to compute the real duration.
      const onSeeked = () => {
        audio.removeEventListener('seeked', onSeeked)
        if (typeof audio.duration === 'number' && isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration)
        }
        audio.currentTime = 0
      }
      audio.addEventListener('seeked', onSeeked, { once: true })
      audio.currentTime = 1e101
    }
  }

  const handleDurationChange = () => {
    const audio = audioRef.current
    if (!audio) return
    const d = audio.duration
    if (typeof d === 'number' && isFinite(d) && !isNaN(d) && d > 0) {
      setDuration(d)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (isFinite(time)) {
      setCurrentTime(time)
      if (audioRef.current) {
        audioRef.current.currentTime = time
      }
    }
  }

  const cycleSpeed = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1
    setPlaybackRate(nextRate)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate
    }
  }

  const formatAudioTime = (sec: number) => {
    if (typeof sec !== 'number' || isNaN(sec) || !isFinite(sec) || sec <= 0) {
      return '0:00'
    }
    const totalSeconds = Math.round(sec)
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 p-2 rounded-xl min-w-[14rem] max-w-xs select-none',
        isCurrentUser
          ? 'bg-indigo-700/60 text-white'
          : 'bg-white dark:bg-zinc-700/60 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-zinc-600'
      )}
      role='region'
      aria-label='Voice message player'
    >
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onEnded={handleEnded}
        preload='metadata'
      />
      <button
        type='button'
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        className={cn(
          'p-2 rounded-full shrink-0 transition shadow-sm',
          isCurrentUser
            ? 'bg-white text-indigo-600 hover:bg-indigo-50'
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
        )}
      >
        {isPlaying ? <Pause size={15} aria-hidden='true' /> : <Play size={15} className='ml-0.5' aria-hidden='true' />}
      </button>

      <div className='flex-1 flex flex-col justify-center min-w-0'>
        <input
          type='range'
          min={0}
          max={isFinite(duration) && duration > 0 ? duration : 100}
          step={0.01}
          value={isFinite(currentTime) ? currentTime : 0}
          onChange={handleSeek}
          aria-label='Voice message timeline'
          className='w-full h-1.5 bg-gray-300 dark:bg-zinc-500 rounded-lg appearance-none cursor-pointer accent-indigo-500'
        />
        <div className='flex justify-between items-center text-[10px] opacity-75 mt-1 font-mono' aria-hidden='true'>
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>

      <button
        type='button'
        onClick={cycleSpeed}
        aria-label={`Playback speed ${playbackRate}x`}
        className='px-1.5 py-0.5 rounded text-[10px] font-bold border border-current opacity-75 hover:opacity-100 transition'
        title='Change playback speed'
      >
        {playbackRate}x
      </button>
    </div>
  )
}

// Circular Video Note Player
const VideoNoteMessage: FC<{ src: string }> = ({ src }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  return (
    <div
      onClick={togglePlay}
      role='region'
      aria-label='Circular video note player'
      className='relative w-44 h-44 sm:w-52 sm:h-52 rounded-full overflow-hidden border-2 border-indigo-400 dark:border-indigo-500 shadow-md cursor-pointer bg-black group select-none'
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        loop
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className='w-full h-full object-cover scale-x-[-1]'
      />
      {!isPlaying && (
        <div className='absolute inset-0 bg-black/40 flex items-center justify-center transition'>
          <button
            type='button'
            aria-label='Play circular video note'
            className='p-3 rounded-full bg-white/90 text-indigo-600 shadow-lg group-hover:scale-110 transition-transform'
          >
            <Play size={24} className='ml-1' aria-hidden='true' />
          </button>
        </div>
      )}
      <button
        type='button'
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute video note' : 'Mute video note'}
        className='absolute bottom-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition opacity-0 group-hover:opacity-100'
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <VolumeX size={14} aria-hidden='true' /> : <Volume2 size={14} aria-hidden='true' />}
      </button>
    </div>
  )
}

interface MessagesProps {
  initialMessages: Message[]
  sessionId: string
  sessionImg: string
  chatPartner: User
  chatId: string
  isPartnerTyping?: boolean
  highlightQuery?: string
  messages: Message[]
  setMessages: Dispatch<SetStateAction<Message[]>>
  onRetryMessage?: (message: Message) => void
  onReplyToMessage?: (message: Message) => void
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
  messages,
  setMessages,
  onRetryMessage,
  onReplyToMessage,
}) => {
  const [hasMore, setHasMore] = useState<boolean>(initialMessages.length >= 30)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState<string>('')
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null)
  const [jumpHighlightId, setJumpHighlightId] = useState<string | null>(null)
  const [swipingMessageId, setSwipingMessageId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<number>(0)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const isHorizontalGesture = useRef<boolean | null>(null)
  const scrollDownRef = useRef<HTMLDivElement | null>(null)
  const isInitialMount = useRef<boolean>(true)
  const isGroupChat = chatId.startsWith('group--')

  const scrollToMessage = (targetMessageId: string) => {
    const el = document.getElementById(`message-${targetMessageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setJumpHighlightId(targetMessageId)
      setTimeout(() => setJumpHighlightId(null), 2000)
    } else {
      toast('Quoted message not found in visible history', { icon: 'ℹ️' })
    }
  }

  // Touch gesture handlers for mobile / Android swiping to reply
  const handleTouchStart = (messageId: string, e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isHorizontalGesture.current = null
  }

  const handleTouchMove = (messageId: string, e: React.TouchEvent) => {
    const diffX = e.touches[0].clientX - touchStartX.current
    const diffY = e.touches[0].clientY - touchStartY.current

    if (isHorizontalGesture.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalGesture.current = Math.abs(diffX) > Math.abs(diffY)
      }
    }

    if (isHorizontalGesture.current && diffX > 0) {
      const clamped = Math.min(diffX, 70)
      setSwipingMessageId(messageId)
      setSwipeOffset(clamped)
      if (clamped >= 50 && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20)
      }
    }
  }

  const handleTouchEnd = (message: Message) => {
    if (swipingMessageId === message.id && swipeOffset >= 50) {
      onReplyToMessage?.(message)
    }
    setSwipingMessageId(null)
    setSwipeOffset(0)
    isHorizontalGesture.current = null
  }

  const formatTimeStamp = (timeStamp: number) => {
    try {
      if (!timeStamp || isNaN(timeStamp)) return ''
      return format(timeStamp, 'HH:mm')
    } catch {
      return ''
    }
  }

  // Auto-scroll on mount and on new messages
  useEffect(() => {
    if (isInitialMount.current) {
      scrollDownRef.current?.scrollIntoView({ behavior: 'auto' })
      isInitialMount.current = false
    }
  }, [])

  // Auto-scroll on latest message sent or received
  useEffect(() => {
    scrollDownRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Mark conversation as read whenever chatId changes or messages from partner arrive
  useEffect(() => {
    axios.post('/api/message/read', { chatId }).catch(() => {})
  }, [chatId, messages.length])

  // Real-time Pusher event listeners
  useEffect(() => {
    const channelKey = toPusherKey(`private-chat:${chatId}`)
    const channel = pusherClient.subscribe(channelKey)

    // New incoming message
    const messageHandler = (incoming: Message) => {
      setMessages((prev) => {
        // De-duplicate if this is our own message optimistically sent
        const existingIdx = prev.findIndex(
          (m) =>
            m.id === incoming.id ||
            (m.status === 'sending' && m.senderId === incoming.senderId && m.text === incoming.text)
        )
        if (existingIdx !== -1) {
          const next = [...prev]
          next[existingIdx] = { ...incoming, status: 'sent' }
          return next
        }
        return [incoming, ...prev]
      })
      scrollDownRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Message edited
    const editHandler = ({
      messageId,
      text,
      isEdited,
    }: {
      messageId: string
      text: string
      isEdited: boolean
    }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, text, isEdited } : msg))
      )
    }

    // Message deleted
    const deleteHandler = ({ messageId }: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, text: 'This message was deleted', isDeleted: true, mediaUrl: undefined }
            : msg
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

    // Partner read/seen messages
    const seenHandler = ({ readerId }: { readerId: string; seenAt: number }) => {
      if (readerId === chatPartner.id) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.senderId === sessionId ? { ...msg, isSeen: true } : msg
          )
        )
      }
    }

    channel.bind('incoming-message', messageHandler)
    channel.bind('message_edited', editHandler)
    channel.bind('message_deleted', deleteHandler)
    channel.bind('message_reacted', reactHandler)
    channel.bind('messages_seen', seenHandler)

    return () => {
      pusherClient.unsubscribe(channelKey)
      channel.unbind('incoming-message', messageHandler)
      channel.unbind('message_edited', editHandler)
      channel.unbind('message_deleted', deleteHandler)
      channel.unbind('message_reacted', reactHandler)
      channel.unbind('messages_seen', seenHandler)
    }
  }, [chatId, chatPartner.id, sessionId, setMessages])

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
    } catch {
      toast.error('Failed to load earlier messages')
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Custom SAAS message delete state
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null)

  // Handle message edit
  const submitEdit = async (messageId: string) => {
    const trimmed = editingText.trim()
    const targetMsg = messages.find((m) => m.id === messageId)
    if (!trimmed && !targetMsg?.mediaUrl) {
      toast.error('Message text cannot be empty')
      return
    }

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

  // Handle message delete with custom SAAS dialog confirmation
  const confirmDelete = async () => {
    if (!deleteConfirmMessageId) return
    setIsDeleting(true)

    try {
      await axios.post('/api/message/delete', {
        messageId: deleteConfirmMessageId,
        chatId,
      })
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === deleteConfirmMessageId
            ? { ...msg, text: 'This message was deleted', isDeleted: true, mediaUrl: undefined }
            : msg
        )
      )
      toast.success('Message deleted')
      setDeleteConfirmMessageId(null)
    } catch (error: any) {
      toast.error(error?.response?.data || 'Failed to delete message')
    } finally {
      setIsDeleting(false)
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
      role='log'
      aria-label='Chat message history'
      aria-live='polite'
      className='flex h-full flex-1 flex-col-reverse gap-4 p-4 overflow-y-auto overflow-x-hidden scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch'
    >
      <div ref={scrollDownRef} />

      {/* Typing Bubble */}
      {isPartnerTyping && (
        <div className='flex items-end gap-2'>
          <div className='relative w-6 h-6 shrink-0'>
            <Avatar
              src={chatPartner.image}
              name={chatPartner.name}
              sizeClassName='w-6 h-6'
              textClassName='text-[10px] font-bold text-white'
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
        // System generated announcement messages (cannot be replied to, reacted to, or edited)
        if (message.senderId === 'system') {
          return (
            <div
              key={`${message.id}-${message.timestamp}`}
              id={`message-${message.id}`}
              className='flex justify-center my-3 select-none'
            >
              <div className='flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-[11px] font-medium text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700/60 shadow-2xs max-w-sm text-center'>
                <span>{message.text}</span>
              </div>
            </div>
          )
        }

        const isCurrentUser = message.senderId === sessionId
        const hasNextMsgFromSameUser = messages[idx - 1]?.senderId === messages[idx].senderId
        const isEditingThisMessage = editingMessageId === message.id
        const isReactionPickerOpen = activeReactionPickerId === message.id
        const reactions = message.reactions || {}
        const isMatch = highlightQuery && message.text?.toLowerCase().includes(highlightQuery.toLowerCase())

        return (
          <div
            id={`message-${message.id}`}
            key={`${message.id}-${message.timestamp}`}
            onDoubleClick={() => onReplyToMessage?.(message)}
            onTouchStart={(e) => handleTouchStart(message.id, e)}
            onTouchMove={(e) => handleTouchMove(message.id, e)}
            onTouchEnd={() => handleTouchEnd(message)}
            className={cn('group relative transition-all duration-200 select-text', {
              'ring-2 ring-yellow-400/80 rounded-2xl p-1 bg-yellow-50/20': isMatch,
              'ring-2 ring-indigo-500 rounded-2xl p-1 bg-indigo-50/30 dark:bg-indigo-950/30':
                jumpHighlightId === message.id,
            })}
          >
            <div
              style={{
                transform:
                  swipingMessageId === message.id && swipeOffset > 0
                    ? `translateX(${swipeOffset}px)`
                    : 'none',
                transition: swipingMessageId === message.id ? 'none' : 'transform 0.2s ease-out',
              }}
              className={cn('flex items-end relative', {
                'justify-end': isCurrentUser,
              })}
            >
              {/* Swipe to reply visual indicator on Android / touch devices */}
              {swipingMessageId === message.id && swipeOffset > 0 && (
                <div
                  className='absolute -left-7 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-indigo-600 text-white shadow-md flex items-center justify-center transition-all'
                  style={{ opacity: Math.min(swipeOffset / 40, 1) }}
                >
                  <Reply size={13} />
                </div>
              )}
              <div
                className={cn('flex flex-col space-y-1.5 text-base max-w-sm sm:max-w-md mx-2', {
                  'order-1 items-end': isCurrentUser,
                  'order-2 items-start': !isCurrentUser,
                })}
              >
                {/* Group Chat Sender Name */}
                {isGroupChat && !isCurrentUser && !message.isDeleted && !hasNextMsgFromSameUser && (
                  <span className='text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 px-1 select-none'>
                    {message.senderName || 'Member'}
                  </span>
                )}

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
                        aria-label='React with emoji'
                      >
                        <Smile size={15} aria-hidden='true' />
                      </button>

                      {/* Popover Reaction Bar - Positioned correctly to prevent cutoff */}
                      {isReactionPickerOpen && (
                        <div
                          className={cn(
                            'absolute bottom-full mb-1.5 z-30 flex items-center gap-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-full shadow-lg px-2.5 py-1 whitespace-nowrap',
                            isCurrentUser ? 'right-0' : 'left-0'
                          )}
                          role='toolbar'
                          aria-label='Quick emoji reactions'
                        >
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(message.id, emoji)}
                              className='hover:scale-125 transition-transform text-base px-1'
                              aria-label={`React with ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Forward button */}
                    <button
                      onClick={() => setForwardingMessage(message)}
                      className='p-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors'
                      title='Forward message'
                      aria-label='Forward message'
                    >
                      <Forward size={14} aria-hidden='true' />
                    </button>

                    {/* Reply button (Double click or swipe on mobile) */}
                    <button
                      onClick={() => onReplyToMessage?.(message)}
                      className='p-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors'
                      title='Reply (Double click or swipe)'
                      aria-label='Reply to message'
                    >
                      <Reply size={14} aria-hidden='true' />
                    </button>

                    {/* Edit button (Sender only) */}
                    {isCurrentUser && (
                      <button
                        onClick={() => {
                          setEditingMessageId(message.id)
                          setEditingText(message.text || '')
                        }}
                        className='p-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        title='Edit message'
                        aria-label='Edit message'
                      >
                        <Edit2 size={14} aria-hidden='true' />
                      </button>
                    )}

                    {/* Delete button (Sender only) */}
                    {isCurrentUser && (
                      <button
                        onClick={() => setDeleteConfirmMessageId(message.id)}
                        className='p-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-red-500 hover:text-red-700'
                        title='Delete message'
                        aria-label='Delete message'
                      >
                        <Trash2 size={14} aria-hidden='true' />
                      </button>
                    )}
                  </div>
                )}

                {/* Message Bubble Container */}
                <div
                  className={cn('px-4 py-2.5 rounded-2xl inline-block shadow-xs', {
                    'bg-indigo-600 text-white': isCurrentUser && !message.isDeleted,
                    'bg-gray-200 dark:bg-zinc-800 text-gray-900 dark:text-gray-100':
                      !isCurrentUser && !message.isDeleted,
                    'bg-gray-100 dark:bg-zinc-900 text-gray-500 italic border border-gray-200 dark:border-zinc-800':
                      message.isDeleted,
                    'rounded-br-none': !hasNextMsgFromSameUser && isCurrentUser,
                    'rounded-bl-none': !hasNextMsgFromSameUser && !isCurrentUser,
                  })}
                >
                  {/* Quoted message if this is a reply */}
                  {message.replyTo && !message.isDeleted && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        scrollToMessage(message.replyTo!.id)
                      }}
                      className={cn(
                        'mb-2 p-2 rounded-lg border-l-4 text-xs cursor-pointer select-none transition hover:opacity-90',
                        isCurrentUser
                          ? 'bg-indigo-700/60 border-white text-white'
                          : 'bg-black/5 dark:bg-white/10 border-indigo-500 text-gray-800 dark:text-gray-100'
                      )}
                      title='Click to jump to quoted message'
                    >
                      <div className='flex items-center gap-1 font-semibold text-[11px] mb-0.5 text-indigo-200 dark:text-indigo-400'>
                        <Reply size={11} className='shrink-0' />
                        <span className='truncate'>{message.replyTo.senderName}</span>
                      </div>
                      <p className='truncate opacity-80 text-[11px]'>
                        {message.replyTo.text ||
                          (message.replyTo.mediaType
                            ? `[${message.replyTo.mediaType}]`
                            : 'Attachment')}
                      </p>
                    </div>
                  )}

                  {/* Media attachments - Renders even while editing so attachment is always visible */}
                  {message.mediaUrl && !message.isDeleted && (
                    <div className='mb-2'>
                      {message.mediaType === 'image' && (
                        <a
                          href={message.mediaUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='block overflow-hidden rounded-lg max-w-xs'
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={message.mediaUrl}
                            alt='Attached image'
                            className='rounded-lg max-h-60 w-auto object-cover hover:opacity-95 transition-opacity'
                            loading='lazy'
                          />
                        </a>
                      )}

                      {message.mediaType === 'video' && (
                        <div className='overflow-hidden rounded-lg max-w-xs sm:max-w-sm'>
                          <video
                            src={message.mediaUrl}
                            controls
                            className='rounded-lg max-h-72 w-full bg-black/40'
                            preload='metadata'
                          />
                        </div>
                      )}

                      {message.mediaType === 'audio' && (
                        <AudioPlayerMessage
                          src={message.mediaUrl}
                          isCurrentUser={isCurrentUser}
                          initialDuration={message.duration}
                        />
                      )}

                      {message.mediaType === 'video-note' && (
                        <VideoNoteMessage src={message.mediaUrl} />
                      )}

                      {(!message.mediaType || message.mediaType === 'file') && (
                        <a
                          href={message.mediaUrl}
                          download={message.fileName || 'download'}
                          className={cn(
                            'flex items-center gap-3 p-2.5 rounded-xl border transition-all max-w-xs',
                            {
                              'bg-indigo-700/60 border-indigo-400/40 text-white hover:bg-indigo-700':
                                isCurrentUser,
                              'bg-white dark:bg-zinc-700 border-gray-200 dark:border-zinc-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50':
                                !isCurrentUser,
                            }
                          )}
                        >
                          <FileText size={28} className='shrink-0' />
                          <div className='truncate text-xs flex-1'>
                            <p className='font-semibold truncate'>{message.fileName || 'Attachment'}</p>
                            {message.fileSize && (
                              <p className='opacity-75'>
                                {(message.fileSize / 1024).toFixed(1)} KB
                              </p>
                            )}
                          </div>
                          <Download size={16} className='shrink-0 opacity-80' />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Inline Edit View (displays directly beneath attachment or stand-alone) */}
                  {isEditingThisMessage ? (
                    <div className='flex items-center gap-1.5 mt-1 bg-white/95 dark:bg-zinc-900/95 p-1.5 border border-indigo-400 rounded-xl shadow-xs'>
                      <input
                        type='text'
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitEdit(message.id)
                          if (e.key === 'Escape') setEditingMessageId(null)
                        }}
                        placeholder='Add or edit text...'
                        className='text-sm text-gray-900 dark:text-gray-100 bg-transparent border-0 focus:ring-0 p-1 flex-1 min-w-[12rem] max-w-xs'
                        aria-label='Edit message text'
                        autoFocus
                      />
                      <button
                        onClick={() => submitEdit(message.id)}
                        className='p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition'
                        title='Save'
                        aria-label='Save edited message'
                      >
                        <Check size={14} aria-hidden='true' />
                      </button>
                      <button
                        onClick={() => setEditingMessageId(null)}
                        className='p-1.5 rounded-lg bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 transition'
                        title='Cancel'
                        aria-label='Cancel editing'
                      >
                        <X size={14} aria-hidden='true' />
                      </button>
                    </div>
                  ) : (
                    /* Regular text & timestamps & status */
                    <>
                      {message.text && (
                        <p className='break-words text-sm'>
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

                          {/* Optimistic Status / Checkmarks for Sent Messages */}
                          {isCurrentUser && !message.isDeleted && (
                            <span className='inline-flex items-center ml-1.5 align-middle select-none'>
                              {message.status === 'sending' ? (
                                <span title='Sending...'>
                                  <Loader2 className='w-3 h-3 animate-spin text-indigo-200' />
                                </span>
                              ) : message.status === 'error' ? (
                                <button
                                  type='button'
                                  onClick={() => onRetryMessage?.(message)}
                                  className='inline-flex items-center gap-1 text-[11px] text-red-200 bg-red-900/60 hover:bg-red-800/80 px-1.5 py-0.5 rounded transition cursor-pointer'
                                  title='Failed to send. Click to retry.'
                                >
                                  <AlertCircle className='w-3 h-3 text-red-300' />
                                  <span>Retry</span>
                                </button>
                              ) : message.isSeen ? (
                                <span className='inline-flex items-center gap-0.5 text-sky-300' title='Seen'>
                                  <CheckCheck className='w-3.5 h-3.5 text-sky-300' />
                                  <span className='text-[10px] font-medium hidden sm:inline'>Seen</span>
                                </span>
                              ) : (
                                <span title='Sent / Delivered'>
                                  <Check className='w-3 h-3 text-indigo-200' />
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                      )}

                      {/* If only media and no text, render timestamp and status below media */}
                      {!message.text && !message.isDeleted && (
                        <div
                          className={cn('flex items-center justify-end gap-1 text-[10px] mt-1', {
                            'text-indigo-200': isCurrentUser,
                            'text-gray-400': !isCurrentUser,
                          })}
                        >
                          {message.isEdited && <span className='opacity-75'>(edited)</span>}
                          <span>{formatTimeStamp(message.timestamp)}</span>
                          {isCurrentUser && (
                            <span className='inline-flex items-center ml-0.5'>
                              {message.status === 'sending' ? (
                                <Loader2 className='w-3 h-3 animate-spin text-indigo-200' />
                              ) : message.status === 'error' ? (
                                <button
                                  type='button'
                                  onClick={() => onRetryMessage?.(message)}
                                  className='text-red-300'
                                  title='Retry'
                                >
                                  <AlertCircle className='w-3 h-3' />
                                </button>
                              ) : message.isSeen ? (
                                <CheckCheck className='w-3.5 h-3.5 text-sky-300' />
                              ) : (
                                <Check className='w-3 h-3 text-indigo-200' />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

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
                className={cn('relative w-6 h-6 shrink-0', {
                  'order-2': isCurrentUser,
                  'order-1': !isCurrentUser,
                  invisible: hasNextMsgFromSameUser,
                })}
              >
                <Avatar
                  src={
                    isCurrentUser
                      ? (sessionImg as string)
                      : (message.senderImg || (isGroupChat ? undefined : chatPartner.image))
                  }
                  name={
                    isCurrentUser
                      ? 'You'
                      : (message.senderName || chatPartner.name)
                  }
                  sizeClassName='w-6 h-6'
                  textClassName='text-[10px] font-bold text-white'
                />
              </div>
            </div>
          </div>
        )
      })}

      {/* Load More Button for Pagination */}
      {hasMore && (
        <div className='flex justify-center py-2'>
          <button
            onClick={loadMoreMessages}
            disabled={isLoadingMore}
            className='text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition disabled:opacity-50'
          >
            {isLoadingMore ? (
              <span className='flex items-center gap-1.5'>
                <Loader2 size={12} className='animate-spin' />
                Loading older messages...
              </span>
            ) : (
              'Load earlier messages'
            )}
          </button>
        </div>
      )}
      {/* Forward Message Modal */}
      <ForwardMessageModal
        isOpen={Boolean(forwardingMessage)}
        onClose={() => setForwardingMessage(null)}
        message={forwardingMessage}
        sessionId={sessionId}
        currentChatId={chatId}
      />

      {/* Custom Premium SAAS Delete Confirmation Dialog */}
      {deleteConfirmMessageId && (
        <div
          role='dialog'
          aria-modal='true'
          aria-labelledby='delete-modal-title'
          className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150'
        >
          <div className='relative w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-6 shadow-2xl text-center'>
            <div className='h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-200 dark:border-red-900/50'>
              <Trash2 size={22} aria-hidden='true' />
            </div>
            <h3 id='delete-modal-title' className='text-base font-semibold text-gray-900 dark:text-gray-100'>
              Delete message?
            </h3>
            <p className='text-xs text-gray-500 dark:text-gray-400 mt-1.5 mb-6 leading-relaxed'>
              This action cannot be undone. This message will be permanently deleted for everyone in this conversation.
            </p>
            <div className='flex items-center gap-3 justify-center'>
              <button
                type='button'
                disabled={isDeleting}
                onClick={() => setDeleteConfirmMessageId(null)}
                className='px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition disabled:opacity-50'
              >
                Cancel
              </button>
              <Button
                isLoading={isDeleting}
                onClick={confirmDelete}
                className='h-9 px-4 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl'
                aria-label='Confirm delete message'
              >
                Delete for everyone
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Messages
