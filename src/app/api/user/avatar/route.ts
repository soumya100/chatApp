import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { z } from "zod"

const updateAvatarSchema = z.object({
    image: z
        .string()
        .min(1, "Image payload is required")
        .max(3 * 1024 * 1024, "Image exceeds maximum allowed size (3MB)")
        .refine(
            (val) => val.startsWith("data:image/") || val.startsWith("https://"),
            "Invalid image format. Must be a valid HTTPS URL or data URI."
        ),
})

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response(JSON.stringify({ message: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            })
        }

        let body
        try {
            body = await req.json()
        } catch {
            return new Response(JSON.stringify({ message: "Invalid JSON request body" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }

        const parseResult = updateAvatarSchema.safeParse(body)
        if (!parseResult.success) {
            const errorMsg = parseResult.error.errors[0]?.message || "Invalid avatar data"
            return new Response(JSON.stringify({ message: errorMsg }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }

        const { image } = parseResult.data

        // Retrieve existing user record from Redis
        const rawUser = await db.get(`user:${session.user.id}`)
        if (!rawUser) {
            return new Response(JSON.stringify({ message: "User not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            })
        }

        const userObj = (typeof rawUser === "string" ? JSON.parse(rawUser) : rawUser) as User

        // Update image property
        userObj.image = image

        // Persist back to Redis
        await db.set(`user:${session.user.id}`, JSON.stringify(userObj))

        return new Response(
            JSON.stringify({
                success: true,
                message: "Avatar updated successfully",
                image
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" }
            }
        )
    } catch (error) {
        console.error("Avatar update error:", error)
        return new Response(
            JSON.stringify({ message: "Internal server error updating avatar" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        )
    }
}

