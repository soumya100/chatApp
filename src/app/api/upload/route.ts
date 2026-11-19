import { authOptions } from "@/lib/auth"
import { handleUpload } from "@vercel/blob/client"
import { getServerSession } from "next-auth"

export const runtime = "nodejs"

const MAX_UPLOAD_SIZE = 30 * 1024 * 1024

// Exact MIME allow-list. Wildcards like "image/*" are deliberately avoided:
// an image/* entry also admits image/svg+xml, and SVG served inline executes
// script (stored XSS). Every entry below renders as inert raster media.
const ALLOWED_CONTENT_TYPES = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "video/*",
    "audio/*",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "application/zip",
    "application/x-zip-compressed"
]

// Defence in depth: browser-active documents are rejected even if a future
// edit accidentally re-introduces a permissive wildcard above.
const FORBIDDEN_CONTENT_TYPES = new Set([
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml"
])

function assertAllowedContentType(candidate: unknown): void {
    const type = String(candidate ?? "").split(";")[0].trim().toLowerCase()
    if (type && FORBIDDEN_CONTENT_TYPES.has(type)) {
        throw new Error("This file format is not allowed. Browser-executable document types (SVG/HTML/XHTML) are rejected.")
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()

        // The Vercel Blob client sends the file's content type when requesting
        // the upload token and when reporting the completed upload. Both
        // checkpoints are screened so a browser-active document can never
        // obtain a token or be confirmed into storage.
        assertAllowedContentType(body?.payload?.contentType)
        if (body?.type === "blob.upload-completed" && Array.isArray(body?.payload?.files)) {
            for (const file of body.payload.files) assertAllowedContentType(file?.contentType)
        }

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
