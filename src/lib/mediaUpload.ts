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
  // Exact raster image types only: a bare image/ prefix would admit
  // image/svg+xml, which executes script when the blob URL is opened inline.
  const isSupportedMedia = /^(image\/(png|jpeg|gif|webp)|video\/|audio\/)/.test(mimeType)
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

  // The MIME type decides the classification; the file extension is only a
  // fallback for browsers that sent no usable MIME type. Extensions such as
  // `.webm` and `.mp4` can carry either audio or video, so consulting them
  // first would misclassify e.g. an audio/webm voice note as video.
  if (mimeType.startsWith("image/")) {
    mediaType = "image"
  } else if (mimeType.startsWith("video/")) {
    mediaType = "video"
  } else if (mimeType.startsWith("audio/")) {
    mediaType = "audio"
  } else if (/^(png|jpe?g|gif|webp|avif)$/.test(extension)) {
    mediaType = "image"
  } else if (/^(mp4|mov|m4v|webm)$/.test(extension)) {
    mediaType = "video"
  } else if (/^(mp3|wav|ogg|webm|m4a|aac)$/.test(extension)) {
    mediaType = "audio"
  }

  return {
    url: blob.url,
    mediaType,
    fileName: file.name,
    fileSize: file.size,
  }
}
