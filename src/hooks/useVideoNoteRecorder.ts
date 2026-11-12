'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { formatDuration } from './useAudioRecorder'

export interface UseVideoNoteRecorderOptions {
  onRecordingComplete?: (file: File, duration: number) => Promise<void> | void
  onError?: (error: unknown) => void
  maxDurationSeconds?: number
}

export interface UseVideoNoteRecorderReturn {
  isOpen: boolean
  isRecording: boolean
  duration: number
  formattedDuration: string
  videoPreviewRef: React.RefObject<HTMLVideoElement>
  openModal: () => Promise<void>
  closeModal: () => void
  startRecording: () => void
  stopRecording: () => Promise<void>
}

/**
 * Custom hook managing circular webcam video note recording.
 * Adheres to the Single Responsibility Principle (SRP) by isolating camera/microphone
 * stream initialization, preview element binding, and chunk recording from UI presentation.
 */
export function useVideoNoteRecorder(
  options: UseVideoNoteRecorderOptions = {}
): UseVideoNoteRecorderReturn {
  const { maxDurationSeconds = 60 } = options

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [duration, setDuration] = useState<number>(0)
  const durationRef = useRef<number>(0)

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)

  // Keep a ref to stopRecording to invoke when reaching maxDurationSeconds in timer
  const stopRecordingRef = useRef<() => Promise<void>>()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  const closeModal = (): void => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsOpen(false)
    setIsRecording(false)
    setDuration(0)
    chunksRef.current = []
  }

  const openModal = async (): Promise<void> => {
    if (typeof window === 'undefined') return

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Camera recording is not supported in this browser context (HTTPS or localhost is required)')
      return
    }

    setIsOpen(true)
    setIsRecording(false)
    setDuration(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      })
      streamRef.current = stream

      setTimeout(() => {
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream
          videoPreviewRef.current.play().catch(() => {})
        }
      }, 100)
    } catch (err: any) {
      console.error('[useVideoNoteRecorder] Camera/Mic error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Camera/Mic permission was denied. Please allow camera access in your browser settings.', {
          duration: 5000,
        })
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error('No camera or microphone found on this device.')
      } else {
        toast.error('Camera/Microphone permission denied or not available')
      }
      options.onError?.(err)
      closeModal()
    }
  }

  const startRecording = (): void => {
    if (!streamRef.current) return

    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : ''

    const recorderOptions = mimeType ? { mimeType } : undefined
    const mediaRecorder = new MediaRecorder(streamRef.current, recorderOptions)
    mediaRecorderRef.current = mediaRecorder

    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    mediaRecorder.start(250)
    setIsRecording(true)
    durationRef.current = 0
    setDuration(0)

    timerRef.current = setInterval(() => {
      durationRef.current += 1
      setDuration(durationRef.current)
      if (durationRef.current >= maxDurationSeconds) {
        stopRecordingRef.current?.()
      }
    }, 1000)
  }

  const stopRecording = async (): Promise<void> => {
    if (!mediaRecorderRef.current) return
    if (timerRef.current) clearInterval(timerRef.current)

    const mediaRecorder = mediaRecorderRef.current
    const finalDuration = durationRef.current

    return new Promise<void>((resolve) => {
      mediaRecorder.onstop = async () => {
        try {
          const mime = mediaRecorder.mimeType || 'video/webm'
          const videoBlob = new Blob(chunksRef.current, { type: mime })

          if (videoBlob.size === 0) {
            toast.error('Video note was empty')
            return
          }

          const extension = mime.includes('mp4') ? 'mp4' : 'webm'
          const videoFile = new File([videoBlob], `video-note-${Date.now()}.${extension}`, {
            type: mime,
          })

          if (options.onRecordingComplete) {
            await options.onRecordingComplete(videoFile, finalDuration)
          }
          closeModal()
        } catch (err) {
          console.error('[useVideoNoteRecorder] Stop error:', err)
          options.onError?.(err)
        } finally {
          setIsRecording(false)
          durationRef.current = 0
          setDuration(0)
          chunksRef.current = []
          resolve()
        }
      }

      mediaRecorder.stop()
    })
  }

  // Update stopRecordingRef for the max duration interval callback
  stopRecordingRef.current = stopRecording

  return {
    isOpen,
    isRecording,
    duration,
    formattedDuration: formatDuration(duration),
    videoPreviewRef,
    openModal,
    closeModal,
    startRecording,
    stopRecording,
  }
}

