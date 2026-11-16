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
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const allowedDocumentExtensions = new Set(['pdf', 'doc', 'docx', 'txt', 'zip'])
  const allowedDocumentMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
  ])
  const isSupportedMedia = /^(image|video|audio)\//.test(mimeType)
  const isSupportedDocument =
    allowedDocumentExtensions.has(extension) &&
    (!mimeType || allowedDocumentMimeTypes.has(mimeType))
  if (!isSupportedMedia && !isSupportedDocument) {
    throw new Error('This file format is not supported. Supported files: images, videos, audio, PDF, DOC/DOCX, TXT and ZIP.')
  }

  const canonicalDocumentMimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    zip: 'application/zip',
  }
  const uploadBody =
    isSupportedDocument && (!mimeType || mimeType === 'application/octet-stream')
      ? file.slice(0, file.size, canonicalDocumentMimeTypes[extension])
      : file

  const blob = await upload(file.name, uploadBody, {
    access: "public",
    handleUploadUrl: "/api/upload",
  })

  let mediaType: UploadedMediaResponse["mediaType"] = "file"

  if (mimeType.startsWith("image/") || /^(png|jpe?g|gif|webp|avif)$/.test(extension)) {
    mediaType = "image"
  } else if (mimeType.startsWith("video/") || /^(mp4|webm|mov|m4v)$/.test(extension)) {
    mediaType = "video"
  } else if (mimeType.startsWith("audio/") || /^(mp3|wav|ogg|webm|m4a|aac)$/.test(extension)) {
    mediaType = "audio"
  }

  return {
    url: blob.url,
    mediaType,
    fileName: file.name,
    fileSize: file.size,
  }
}
