import { Button } from '@/common'
import axios from 'axios'
import { FileIcon, ImageIcon, Loader2, Paperclip, X } from 'lucide-react'
import Image from 'next/image'
import { ChangeEvent, FC, KeyboardEvent, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import TextareaAutosize from 'react-textarea-autosize'

interface ChatInputProps {
  chatPartner: string
  chatId: string
}

interface PendingAttachment {
  file: File
  previewUrl: string
  isImage: boolean
}

const ChatInput: FC<ChatInputProps> = ({ chatPartner, chatId }) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [input, setInput] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const lastTypingSignal = useRef<number>(0)

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

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size cannot exceed 10MB')
      return
    }

    const isImage = file.type.startsWith('image/')
    const previewUrl = URL.createObjectURL(file)

    setAttachment({
      file,
      previewUrl,
      isImage,
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

  const sendMessage = async () => {
    const trimmed = input.trim()
    if ((!trimmed && !attachment) || isLoading) return

    setIsLoading(true)
    axios.post('/api/message/typing', { chatId, isTyping: false }).catch(() => {})

    try {
      let mediaPayload: {
        mediaUrl?: string
        mediaType?: 'image' | 'file'
        fileName?: string
        fileSize?: number
      } = {}

      // Upload attachment if present
      if (attachment) {
        const formData = new FormData()
        formData.append('file', attachment.file)

        const uploadRes = await axios.post<{
          url: string
          mediaType: 'image' | 'file'
          fileName: string
          fileSize: number
        }>('/api/upload', formData)

        mediaPayload = {
          mediaUrl: uploadRes.data.url,
          mediaType: uploadRes.data.mediaType,
          fileName: uploadRes.data.fileName,
          fileSize: uploadRes.data.fileSize,
        }
      }

      await axios.post('/api/message/send', {
        text: trimmed,
        chatId,
        ...mediaPayload,
      })

      setInput('')
      removeAttachment()
      textAreaRef.current?.focus()
    } catch (error: any) {
      toast.error(error?.response?.data || 'Something went wrong. Please try later')
    } finally {
      setIsLoading(false)
    }
  }

  const enterPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
          {attachment.isImage ? (
            <div className='relative h-12 w-12 rounded overflow-hidden'>
              <Image
                src={attachment.previewUrl}
                alt='Attachment preview'
                fill
                className='object-cover'
              />
            </div>
          ) : (
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
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className='relative flex-1 overflow-hidden rounded-lg shadow-xs ring-1 ring-inset ring-gray-300 dark:ring-zinc-700 focus-within:ring-2 focus-within:ring-indigo-600 dark:bg-zinc-900'>
        <TextareaAutosize
          autoFocus
          onKeyDown={enterPress}
          ref={textAreaRef}
          rows={1}
          value={input}
          onChange={handleInputChange}
          placeholder={`Message ${chatPartner}...`}
          className='block w-full h-full resize-none border-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-0 sm:py-2 sm:leading-6 sm:text-sm pl-3 pr-24'
        />

        <div className='py-1' aria-hidden>
          <div className='py-px'>
            <div className='h-8' />
          </div>
        </div>

        <div className='absolute right-2 bottom-1.5 flex items-center gap-1'>
          {/* Hidden File Input */}
          <input
            type='file'
            ref={fileInputRef}
            onChange={handleFileSelect}
            className='hidden'
            accept='image/*,.pdf,.doc,.docx,.txt,.zip'
          />

          {/* Attachment Button */}
          <button
            type='button'
            onClick={() => fileInputRef.current?.click()}
            className='p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors'
            title='Attach image or document'
          >
            <Paperclip size={18} />
          </button>

          {/* Send Button */}
          <Button
            onClick={sendMessage}
            type='submit'
            isLoading={isLoading}
            size='sm'
            className='h-8 px-3'
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ChatInput
