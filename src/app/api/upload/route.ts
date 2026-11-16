import { authOptions } from "@/lib/auth"
import { handleUpload } from "@vercel/blob/client"
import { getServerSession } from "next-auth"

export const runtime = "nodejs"

const MAX_UPLOAD_SIZE = 30 * 1024 * 1024

const ALLOWED_CONTENT_TYPES = [
    "image/*",
    "video/*",
    "audio/*",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "application/zip",
    "application/x-zip-compressed"
]

export async function POST(request: Request) {
    try {
        const body = await request.json()

        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async () => {
                const session = await getServerSession(authOptions)

                if (!session?.user?.id) {
                    throw new Error("Unauthorized")
                }

                return {
                    allowedContentTypes: ALLOWED_CONTENT_TYPES,
                    maximumSizeInBytes: MAX_UPLOAD_SIZE,
                    addRandomSuffix: true,
                    tokenPayload: JSON.stringify({ userId: session.user.id })
                }
            }
        })

        return Response.json(jsonResponse)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to initialize upload"
        console.error("File upload initialization error:", message)

        return Response.json(
            { error: message },
            { status: message === "Unauthorized" ? 401 : 400 }
        )
    }
}
