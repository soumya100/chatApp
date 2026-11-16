import { upload } from "@vercel/blob/client"

export interface UploadedMediaResponse {
  url: string
  mediaType: "image" | "video" | "video-note" | "audio" | "file"
  fileName: string
  fileSize: number
}

/**
 * Upload media directly from the browser to persistent Vercel Blob storage.
 * The API route only authorizes the upload; file bytes never pass through
 * the Next.js serverless function.
 */
export async function uploadMedia(file: File): Promise<UploadedMediaResponse> {
  const maxUploadSize = 30 * 1024 * 1024
  if (file.size > maxUploadSize) {
    throw new Error('Media files cannot exceed 30MB. Please record a shorter video note.')
  }
  const mimeType = (file.type || '').split(';')[0].trim().toLowerCase()
  const allowedMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
  ])
  const isSupportedMedia = /^(image|video|audio)\\//.test(mimeType)
  if (!mimeType || (!isSupportedMedia && !allowedMimeTypes.has(mimeType))) {
    throw new Error('This file format is not supported. Supported files: images, videos, audio, PDF, DOC/DOCX, TXT and ZIP.')
  }

  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
  })

  let mediaType: UploadedMediaResponse["mediaType"] = "file"

  if (mimeType.startsWith("image/")) {
    mediaType = "image"
  } else if (mimeType.startsWith("video/")) {
    mediaType = "video"
  } else if (mimeType.startsWith("audio/")) {
    mediaType = "audio"
  }

  return {
    url: blob.url,
    mediaType,
    fileName: file.name,
    fileSize: file.size,
  }
}
