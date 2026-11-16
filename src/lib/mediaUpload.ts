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
const MAX_UPLOAD_SIZE = 30 * 1024 * 1024

const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
])

const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  zip: "application/zip",
}

export async function uploadMedia(file: File): Promise<UploadedMediaResponse> {
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error("Attachments cannot exceed 30MB.")
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || ""
  const mimeType = (file.type || DOCUMENT_MIME_BY_EXTENSION[extension] || "")
    .split(";")[0]
    .trim()
    .toLowerCase()

  const isImage = mimeType.startsWith("image/")
  const isVideo = mimeType.startsWith("video/")
  const isAudio = mimeType.startsWith("audio/")
  const isDocument = ALLOWED_DOCUMENT_TYPES.has(mimeType)

  if (!isImage && !isVideo && !isAudio && !isDocument) {
    throw new Error("This file format is not supported. Allowed: images, videos, audio, PDF, DOC, DOCX, TXT and ZIP.")
  }

  const uploadFile = file.type ? file : new File([file], file.name, { type: mimeType })
  const blob = await upload(file.name, uploadFile, {
    access: "public",
    handleUploadUrl: "/api/upload",
  })

  const mediaType: UploadedMediaResponse["mediaType"] = isImage
    ? "image"
    : isVideo
      ? "video"
      : isAudio
        ? "audio"
        : "file"

  return {
    url: blob.url,
    mediaType,
    fileName: file.name,
    fileSize: file.size,
  }
}
