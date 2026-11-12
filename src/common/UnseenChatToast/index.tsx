"use client"

import { chatHrefConstructor, cn } from '@/lib/utils'
import { Loader2, Reply, Send, X } from 'lucide-react'
import Avatar from '../Avatar'
import Link from 'next/link'
import { FC, FormEvent, useState } from 'react'
import toast, { type Toast } from 'react-hot-toast'
import axios from 'axios'

interface UnSeenChatToastProps {
  t: Toast
  senderId: string
  sessionId: string
  senderImg: string
  senderName: string
  senderMessage: string
  chatId?: string
}

const UnSeenChatToast: FC<UnSeenChatToastProps> = ({
  t,
  senderId,
  sessionId,
  senderImg,
  senderName,
  senderMessage,
  chatId,
}) => {
  const [replyText, setReplyText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState(false)

  const resolvedChatId = chatId || chatHrefConstructor(sessionId, senderId)

  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = replyText.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    try {
      await axios.post('/api/message/send', {
        text: trimmed,
        chatId: resolvedChatId,
      })
      toast.dismiss(t.id)
      toast.success(`Reply sent to ${senderName}!`, { duration: 2500 })
      setReplyText('')
    } catch (err: any) {
      console.error('Failed to send reply from notification:', err)
      toast.error('Failed to send reply. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div
      className={cn(
        'max-w-md w-full bg-white dark:bg-zinc-900 shadow-2xl rounded-xl pointer-events-auto border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-gray-100 flex flex-col overflow-hidden transition-all duration-200',
        {
          'animate-enter': t.visible,
          'animate-leave': !t.visible,
        }
      )}
    >
      <div className='flex items-start p-3.5'>
        {/* Click to open conversation */}
        <Link
          onClick={() => toast.dismiss(t.id)}
          href={`/dashboard/chats/${resolvedChatId}`}
          className='flex-1 flex items-start gap-3 min-w-0 group cursor-pointer'
        >
          <div className='shrink-0 pt-0.5'>
            <Avatar
              src={senderImg}
              name={senderName}
              sizeClassName='w-10 h-10'
              textClassName='text-sm font-bold text-white'
            />
          </div>
          <div className='flex-1 min-w-0'>
            <div className='flex items-center justify-between'>
              <p className='text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate'>
                {senderName}
              </p>
              <span className='text-[10px] text-gray-400 dark:text-zinc-500'>Now</span>
            </div>
            <p className='mt-0.5 text-xs text-gray-600 dark:text-gray-300 line-clamp-2'>
              {senderMessage}
            </p>
          </div>
        </Link>

        {/* Action buttons: Toggle quick reply and Dismiss */}
        <div className='flex items-center gap-1 ml-2 shrink-0'>
          <button
            type='button'
            onClick={() => setShowReplyInput((prev) => !prev)}
            className='p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition'
            title={showReplyInput ? 'Hide quick reply' : 'Quick reply'}
          >
            <Reply size={15} />
          </button>
          <button
            type='button'
            onClick={() => toast.dismiss(t.id)}
            className='p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition'
            title='Dismiss'
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Inline Quick Reply Form */}
      {showReplyInput && (
        <form
          onSubmit={handleSendReply}
          className='px-3.5 pb-3 pt-1 flex items-center gap-1.5 border-t border-gray-100 dark:border-zinc-800/80 bg-gray-50/70 dark:bg-zinc-800/40'
        >
          <input
            type='text'
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Reply to ${senderName}...`}
            className='flex-1 text-xs rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500'
            autoFocus
          />
          <button
            type='submit'
            disabled={isSending || !replyText.trim()}
            className='p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition shadow-xs'
            title='Send reply'
          >
            {isSending ? (
              <Loader2 size={14} className='animate-spin' />
            ) : (
              <Send size={14} />
            )}
          </button>
        </form>
      )}
    </div>
  )
}

export default UnSeenChatToast
