import { authOptions } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { nanoid } from "nanoid"
import fs from "fs"
import path from "path"

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get('file') as File | null

        if (!file) {
            return new Response('No file provided', { status: 400 })
        }

        // Limit file size to 10MB
        const MAX_SIZE = 10 * 1024 * 1024
        if (file.size > MAX_SIZE) {
            return new Response('File exceeds 10MB limit', { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())

        // Ensure public/uploads directory exists
        const uploadDir = path.join(process.cwd(), 'public', 'uploads')
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }

        // Sanitize filename
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const uniqueFileName = `${nanoid()}-${safeName}`
        const filePath = path.join(uploadDir, uniqueFileName)

        await fs.promises.writeFile(filePath, buffer)

        const mediaType = file.type.startsWith('image/') ? 'image' : 'file'
        const url = `/uploads/${uniqueFileName}`

        return Response.json({
            url,
            mediaType,
            fileName: file.name,
            fileSize: file.size
        })

    } catch (error) {
        console.error('File upload error:', error)
        return new Response('Upload failed', { status: 500 })
    }
}

