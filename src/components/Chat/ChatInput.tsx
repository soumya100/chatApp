'use client'

import { Button } from '@/common'
import { useAudioRecorder, useVideoNoteRecorder } from '@/hooks'
import { uploadMedia } from '@/lib/mediaUpload'
import axios from 'axios'
import {
  FileIcon,
  Film,
  Mic,
  Music,
  Paperclip,
  Reply,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import Image from 'next/image'
import {
  ChangeEvent,
  FC,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import toast from 'react-hot-toast'
import TextareaAutosize from 'react-textarea-autosize'

interface ChatInputProps {
  chatPartner: string
  chatId: string
  onSendMessage?: (text: string, mediaPayload?: any) => Promise<void>
  replyingTo?: Message | null
  onCancelReply?: () => void
}

interface PendingAttachment {
  file: File
  previewUrl: string
  fileType: 'image' | 'video' | 'audio' | 'file'
}

const ChatInput: FC<ChatInputProps> = ({
  chatPartner,
  chatId,
  onSendMessage,
  replyingTo,
  onCancelReply,
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [input, setInput] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const lastTypingSignal = useRef<number>(0)

  // Focus textarea when replyingTo changes
  useEffect(() => {
    if (replyingTo) {
      textAreaRef.current?.focus()
    }
  }, [replyingTo])

  // Single Responsibility: Voice message recorder hook
  const audioRecorder = useAudioRecorder({
    onRecordingComplete: async (file: File, duration: number) => {
      setIsLoading(true)
      try {
        const uploadRes = await uploadMedia(file)
        const mediaPayload = {
          mediaUrl: uploadRes.url,
          mediaType: 'audio' as const,
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
          duration,
        }

        if (onSendMessage) {
          await onSendMessage('', mediaPayload)
        } else {
          await axios.post('/api/message/send', {
            text: '',
            chatId,
            ...mediaPayload,
          })
        }
      } catch (err) {
        console.error('Failed to send voice message:', err)
        toast.error('Failed to send voice message')
      } finally {
        setIsLoading(false)
      }
    },
  })

  // Single Responsibility: Circular webcam video note recorder hook
  const videoNoteRecorder = useVideoNoteRecorder({
    maxDurationSeconds: 60,
    onRecordingComplete: async (file: File, duration: number) => {
      setIsLoading(true)
      try {
        const uploadRes = await uploadMedia(file)
        const mediaPayload = {
          mediaUrl: uploadRes.url,
          mediaType: 'video-note' as const,
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
          duration,
        }

        if (onSendMessage) {
          await onSendMessage('', mediaPayload)
        } else {
          await axios.post('/api/message/send', {
            text: '',
            chatId,
            ...mediaPayload,
          })
        }
      } catch (err) {
        console.error('Failed to send video note:', err)
        toast.error('Failed to send video note')
      } finally {
        setIsLoading(false)
      }
    },
  })

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)

    const now = Date.now()
    if (now - lastTypingSignal.current > 2000 && e.target.value.trim().length > 0) {
      lastTypingSignal.current = now
      axios.post('/api/message/typing', { chatId, isTyping: true }).catch(() => {})
    }
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 30 * 1024 * 1024) {
      toast.error('File size cannot exceed 30MB')
      return
    }

    let fileType: 'image' | 'video' | 'audio' | 'file' = 'file'
    if (file.type.startsWith('image/')) fileType = 'image'
    else if (file.type.startsWith('video/')) fileType = 'video'
    else if (file.type.startsWith('audio/')) fileType = 'audio'

    const previewUrl = URL.createObjectURL(file)

    setAttachment({
      file,
      previewUrl,
      fileType,
    })
  }

  const removeAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl)
    }
    setAttachment(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Send Text or Attached File
  const sendMessage = async () => {
    const trimmed = input.trim()
    if ((!trimmed && !attachment) || isLoading) return

    setIsLoading(true)
    axios.post('/api/message/typing', { chatId, isTyping: false }).catch(() => {})

    try {
      let mediaPayload: {
        mediaUrl?: string
        mediaType?: 'image' | 'video' | 'audio' | 'video-note' | 'file'
        fileName?: string
        fileSize?: number
        replyTo?: {
          id: string
          senderName: string
          text?: string
          mediaType?: string
        }
      } = {}

      // Attach quote reply if active
      if (replyingTo) {
        mediaPayload.replyTo = {
          id: replyingTo.id,
          senderName: replyingTo.senderName || chatPartner,
          text: replyingTo.text,
          mediaType: replyingTo.mediaType,
        }
        onCancelReply?.()
      }

      // Upload attachment if present via decoupled upload helper
      if (attachment) {
        const uploadRes = await uploadMedia(attachment.file)
        mediaPayload = {
          mediaUrl: uploadRes.url,
          mediaType: uploadRes.mediaType,
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
        }
      }

      // Clear input and attachment immediately for optimistic UX
      setInput('')
      removeAttachment()
      textAreaRef.current?.focus()

      if (onSendMessage) {
        await onSendMessage(trimmed, mediaPayload)
      } else {
        await axios.post('/api/message/send', {
          text: trimmed,
          chatId,
          ...mediaPayload,
        })
      }
    } catch (error: any) {
      toast.error(error?.response?.data || 'Something went wrong. Please try later')
    } finally {
      setIsLoading(false)
    }
  }

  const enterPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && replyingTo) {
      e.preventDefault()
      onCancelReply?.()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className='border-t border-gray-200 dark:border-zinc-800 px-4 pt-3 mb-2 sm:mb-0'>
      {/* Pending attachment preview */}
      {attachment && (
        <div className='mb-2 flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 w-fit max-w-sm'>
          {attachment.fileType === 'image' && (
            <div className='relative h-12 w-12 rounded overflow-hidden'>
              <Image
                src={attachment.previewUrl}
                alt='Attachment preview'
                fill
                className='object-cover'
              />
            </div>
          )}
          {attachment.fileType === 'video' && (
            <div className='h-10 w-10 flex items-center justify-center rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'>
              <Film size={20} />
            </div>
          )}
          {attachment.fileType === 'audio' && (
            <div className='h-10 w-10 flex items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'>
              <Music size={20} />
            </div>
          )}
          {attachment.fileType === 'file' && (
            <div className='h-10 w-10 flex items-center justify-center rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'>
              <FileIcon size={20} />
            </div>
          )}
          <div className='truncate text-xs text-gray-700 dark:text-gray-300 max-w-[12rem]'>
            <p className='font-medium truncate'>{attachment.file.name}</p>
            <p className='text-gray-400'>{(attachment.file.size / 1024).toFixed(1)} KB</p>
          </div>
          <button
            onClick={removeAttachment}
            className='p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            aria-label='Remove attachment'
          >
            <X size={16} aria-hidden='true' />
          </button>
        </div>
      )}

      {/* Quoted Message Reply Preview Banner */}
      {replyingTo && (
        <div className='mb-2 flex items-center justify-between bg-indigo-50 dark:bg-zinc-800/90 border border-indigo-200 dark:border-zinc-700 px-3 py-2 rounded-lg text-xs shadow-2xs'>
          <div className='flex items-center gap-2 min-w-0 flex-1 mr-2'>
            <div className='p-1 rounded-md bg-indigo-600 text-white shrink-0'>
              <Reply size={12} aria-hidden='true' />
            </div>
            <div className='min-w-0 flex-1'>
              <p className='font-semibold text-indigo-600 dark:text-indigo-400 truncate'>
                Replying to {replyingTo.senderName || chatPartner}
              </p>
              <p className='truncate text-gray-600 dark:text-gray-300 text-[11px]'>
                {replyingTo.text || (replyingTo.mediaType ? `[${replyingTo.mediaType}]` : 'Message')}
              </p>
            </div>
          </div>
          <button
            type='button'
            onClick={onCancelReply}
            className='p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0'
            title='Cancel reply (Esc)'
            aria-label='Cancel reply'
          >
            <X size={15} aria-hidden='true' />
          </button>
        </div>
      )}

      {/* Voice Recording Active Bar */}
      {audioRecorder.isRecording ? (
        <div
          role='status'
          aria-live='polite'
          className='flex items-center justify-between bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg px-4 py-2.5 shadow-sm'
        >
          <div className='flex items-center gap-3'>
            <span className='relative flex h-3 w-3' aria-hidden='true'>
              <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75'></span>
              <span className='relative inline-flex rounded-full h-3 w-3 bg-red-500'></span>
            </span>
            <span className='text-xs font-mono font-bold text-red-600 dark:text-red-400'>
              {audioRecorder.formattedDuration}
            </span>
            <span className='text-xs text-gray-600 dark:text-gray-300'>
              Recording voice message...
            </span>
          </div>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={audioRecorder.cancelRecording}
              className='p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 transition'
              title='Cancel recording'
              aria-label='Cancel voice recording'
            >
              <Trash2 size={18} aria-hidden='true' />
            </button>
            <Button
              onClick={audioRecorder.stopRecording}
              isLoading={isLoading}
              size='sm'
              className='h-8 px-3.5 bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5'
              aria-label='Send voice message'
            >
              <Send size={14} aria-hidden='true' />
              <span>Send</span>
            </Button>
          </div>
        </div>
      ) : (
        /* Regular Chat Input Bar */
        <div className='relative flex-1 overflow-hidden rounded-lg shadow-xs ring-1 ring-inset ring-gray-300 dark:ring-zinc-700 focus-within:ring-2 focus-within:ring-indigo-600 dark:bg-zinc-900'>
          <TextareaAutosize
            autoFocus
            onKeyDown={enterPress}
            ref={textAreaRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            placeholder={`Message ${chatPartner}...`}
            aria-label={`Message ${chatPartner}`}
            className='block w-full h-full resize-none border-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-0 sm:py-2 sm:leading-6 sm:text-sm pl-3 pr-32'
          />

          <div className='py-1' aria-hidden>
            <div className='py-px'>
              <div className='h-8' />
            </div>
          </div>

          <div className='absolute right-2 bottom-1.5 flex items-center gap-0.5 sm:gap-1'>
            {/* Hidden File Input */}
            <input
              type='file'
              ref={fileInputRef}
              onChange={handleFileSelect}
              className='hidden'
              accept='image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip'
              aria-label='Upload attachment'
            />

            {/* Attachment Button */}
            <button
              type='button'
              onClick={() => fileInputRef.current?.click()}
              className='p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors'
              title='Attach image, video or document'
              aria-label='Attach file, image or document'
            >
              <Paperclip size={18} aria-hidden='true' />
            </button>

            {/* Video Note Button */}
            <button
              type='button'
              onClick={videoNoteRecorder.openModal}
              className='p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors'
              title='Record circular video message'
              aria-label='Record video message'
            >
              <Video size={18} aria-hidden='true' />
            </button>

            {/* Voice Message Button */}
            <button
              type='button'
              onClick={audioRecorder.startRecording}
              className='p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors'
              title='Record voice note'
              aria-label='Record voice message'
            >
              <Mic size={18} aria-hidden='true' />
            </button>

            {/* Send Button */}
            <Button
              onClick={sendMessage}
              type='submit'
              isLoading={isLoading}
              size='sm'
              className='h-8 px-3'
              aria-label='Send message'
            >
              Send
            </Button>
          </div>
        </div>
      )}

      {/* Circular Video Note Modal */}
      {videoNoteRecorder.isOpen && (
        <div
          role='dialog'
          aria-modal='true'
          aria-labelledby='video-note-heading'
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4'
        >
          <div className='relative flex flex-col items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full text-white'>
            {/* Close button */}
            <button
              type='button'
              onClick={videoNoteRecorder.closeModal}
              className='absolute top-3 right-3 text-zinc-400 hover:text-white p-1 rounded-full'
              aria-label='Close video message modal'
            >
              <X size={20} aria-hidden='true' />
            </button>

            <h3 id='video-note-heading' className='text-base font-semibold mb-3'>
              Video Message
            </h3>

            {/* Circular Video Preview */}
            <div className='relative w-56 h-56 rounded-full overflow-hidden border-4 border-indigo-500 shadow-xl bg-black flex items-center justify-center mb-4'>
              <video
                ref={videoNoteRecorder.videoPreviewRef}
                autoPlay
                playsInline
                muted
                className='w-full h-full object-cover scale-x-[-1]'
              />
              {videoNoteRecorder.isRecording && (
                <div className='absolute inset-0 rounded-full border-4 border-red-500 animate-pulse pointer-events-none' />
              )}
            </div>

            {/* Status / Timer */}
            <div className='mb-4 text-center'>
              {videoNoteRecorder.isRecording ? (
                <div className='inline-flex items-center gap-2 bg-red-600/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-xs font-mono font-semibold'>
                  <span className='h-2 w-2 rounded-full bg-red-500 animate-ping' />
                  {videoNoteRecorder.formattedDuration} / 1:00
                </div>
              ) : (
                <p className='text-xs text-zinc-400'>
                  Click record to create a circular video note
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className='flex items-center gap-3 w-full justify-center'>
              {!videoNoteRecorder.isRecording ? (
                <Button
                  onClick={videoNoteRecorder.startRecording}
                  className='bg-red-600 hover:bg-red-700 text-white px-6'
                  aria-label='Start video recording'
                >
                  Start Recording
                </Button>
              ) : (
                <>
                  <button
                    type='button'
                    onClick={videoNoteRecorder.closeModal}
                    className='px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300'
                    aria-label='Cancel video recording'
                  >
                    Cancel
                  </button>
                  <Button
                    onClick={videoNoteRecorder.stopRecording}
                    isLoading={isLoading}
                    className='bg-indigo-600 hover:bg-indigo-700 text-white px-5'
                    aria-label='Send video note'
                  >
                    <Send size={15} className='mr-1.5' aria-hidden='true' />
                    Send Note
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatInput
