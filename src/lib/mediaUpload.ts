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
  if (!file.type || !/^(image|video|audio)\\//i.test(file.type.split(';')[0])) {
    throw new Error('This media format is not supported.')
  }

  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
  })

  let mediaType: UploadedMediaResponse["mediaType"] = "file"

  if (file.type.startsWith("image/")) {
    mediaType = "image"
  } else if (file.type.startsWith("video/")) {
    mediaType = "video"
  } else if (file.type.startsWith("audio/")) {
    mediaType = "audio"
  }

  return {
    url: blob.url,
    mediaType,
    fileName: file.name,
    fileSize: file.size,
  }
}
