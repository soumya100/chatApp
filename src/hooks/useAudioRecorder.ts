'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

export interface UseAudioRecorderOptions {
  onRecordingComplete?: (file: File, duration: number) => Promise<void> | void
  onError?: (error: unknown) => void
}

export interface UseAudioRecorderReturn {
  isRecording: boolean
  duration: number
  formattedDuration: string
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  cancelRecording: () => void
}

export const formatDuration = (sec: number): string => {
  if (typeof sec !== 'number' || isNaN(sec) || !isFinite(sec) || sec <= 0) return '0:00'
  const totalSeconds = Math.round(sec)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

/**
 * Custom hook managing the full lifecycle of audio voice recording.
 * Adheres to the Single Responsibility Principle (SRP) by isolating MediaStream,
 * MediaRecorder, and duration timing logic from the presentation component.
 */
export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [duration, setDuration] = useState<number>(0)
  const durationRef = useRef<number>(0)

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup active streams and timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  const startRecording = async (): Promise<void> => {
    if (typeof window === 'undefined') return

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Voice recording is not supported in this browser context (HTTPS or localhost is required)')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''

      const recorderOptions = mimeType ? { mimeType } : undefined
      const mediaRecorder = new MediaRecorder(stream, recorderOptions)
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
      }, 1000)
    } catch (err: any) {
      console.error('[useAudioRecorder] Microphone error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Microphone permission was denied. Please allow microphone access in your browser address bar icon.', {
          duration: 5000,
        })
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error('No microphone hardware detected on this device.')
      } else {
        toast.error(`Microphone error: ${err.message || 'Unable to access microphone'}`)
      }
      options.onError?.(err)
    }
  }

  const cancelRecording = (): void => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsRecording(false)
    durationRef.current = 0
    setDuration(0)
    chunksRef.current = []
  }

  const stopRecording = async (): Promise<void> => {
    if (!mediaRecorderRef.current) return
    if (timerRef.current) clearInterval(timerRef.current)

    const mediaRecorder = mediaRecorderRef.current
    const finalDuration = durationRef.current

    return new Promise<void>((resolve) => {
      mediaRecorder.onstop = async () => {
        try {
          const mime = mediaRecorder.mimeType || 'audio/webm'
          const audioBlob = new Blob(chunksRef.current, { type: mime })

          if (audioBlob.size === 0) {
            toast.error('Voice note was empty')
            return
          }

          const extension = mime.includes('mp4') ? 'mp4' : 'webm'
          const audioFile = new File([audioBlob], `voice-note-${Date.now()}.${extension}`, {
            type: mime,
          })

          if (options.onRecordingComplete) {
            await options.onRecordingComplete(audioFile, finalDuration)
          }
        } catch (err) {
          console.error('[useAudioRecorder] Stop error:', err)
          options.onError?.(err)
        } finally {
          setIsRecording(false)
          durationRef.current = 0
          setDuration(0)
          chunksRef.current = []
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop())
            streamRef.current = null
          }
          resolve()
        }
      }

      mediaRecorder.stop()
    })
  }

  return {
    isRecording,
    duration,
    formattedDuration: formatDuration(duration),
    startRecording,
    stopRecording,
    cancelRecording,
  }
}
