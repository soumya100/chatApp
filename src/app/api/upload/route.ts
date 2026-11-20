import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { handleUpload } from "@vercel/blob/client"
import { getServerSession } from "next-auth"

export const runtime = "nodejs"

const MAX_UPLOAD_SIZE = 30 * 1024 * 1024

// Accept only a single Vercel Blob store hostname. Substring checks are unsafe:
// an attacker can place the trusted suffix in a path, query, or unrelated host.
function isOwnedVercelBlobUrl(value: unknown): value is string {
    if (typeof value !== "string") return false
    try {
        const parsed = new URL(value)
        return parsed.protocol === "https:"
            && !parsed.username
            && !parsed.password
            && !parsed.port
            && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.public\\.blob\\.vercel-storage\\.com$/i.test(parsed.hostname)
            && parsed.pathname.length > 1
            && !parsed.search
            && !parsed.hash
    } catch {
        return false
    }
}

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

        if (body?.type === "blob.upload-completed") {
            const completedUrls = new Set<string>()
            const candidates = [body?.payload?.blob, body?.payload, ...(Array.isArray(body?.payload?.files) ? body.payload.files : [])]
            for (const candidate of candidates) {
                const url = candidate?.url
                if (isOwnedVercelBlobUrl(url)) completedUrls.add(url)
            }
            for (const url of completedUrls) {
                // The message-send Lua transaction removes this marker atomically
                // when the upload is attached. Unclaimed uploads expire via cron.
                await db.zadd("media:orphans", { score: Date.now(), member: url })
            }
        }

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
