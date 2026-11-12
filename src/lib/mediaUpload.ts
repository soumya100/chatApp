import axios from 'axios'

export interface UploadedMediaResponse {
  url: string
  mediaType: 'image' | 'video' | 'video-note' | 'audio' | 'file'
  fileName: string
  fileSize: number
}

/**
 * Upload a media file or recorded blob to the server storage endpoint.
 * Encapsulates FormData creation and response parsing (SOLID: Single Responsibility & Dependency Inversion).
 */
export async function uploadMedia(file: File): Promise<UploadedMediaResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await axios.post<UploadedMediaResponse>('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}

