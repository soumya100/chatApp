import { db } from "@/lib/db"
import { fetchRedis } from "@/helpers/redis"
import { rateLimit } from "@/lib/ratelimit"
import { registerSchema } from "@/lib/validations/auth"
import { generateInitialsAvatar } from "@/lib/avatars"
import bcrypt from "bcryptjs"
import { nanoid } from "nanoid"

export async function POST(req: Request) {
    try {
        // VAPT Hardening: IP-based Sliding Window Rate Limiting (5 requests per 60s)
        const forwardedFor = req.headers.get("x-forwarded-for")
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : (req.headers.get("x-real-ip") || "127.0.0.1")

        const limitResult = await rateLimit(clientIp, "register", { limit: 5, windowSeconds: 60 })
        if (!limitResult.success) {
            return new Response(
                JSON.stringify({
                    message: "Too many registration attempts. Please wait a minute and try again."
                }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Retry-After": "60"
                    }
                }
            )
        }

        // Validate payload against strict Zod schema
        let body
        try {
            body = await req.json()
        } catch {
            return new Response(JSON.stringify({ message: "Invalid JSON payload" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }

        const parseResult = registerSchema.safeParse(body)
        if (!parseResult.success) {
            const firstError = parseResult.error.errors[0]?.message || "Invalid input data"
            return new Response(JSON.stringify({ message: firstError }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            })
        }

        const { name, email, password } = parseResult.data

        // Check if user already exists
        const existingUserId = (await fetchRedis("get", `user:email:${email}`)) as string | null
        if (existingUserId) {
            return new Response(
                JSON.stringify({ message: "An account with this email address already exists." }),
                {
                    status: 409,
                    headers: { "Content-Type": "application/json" }
                }
            )
        }

        // Hash password securely with bcrypt work factor 12
        const hashedPassword = await bcrypt.hash(password, 12)

        // Generate safe unique user ID
        const userId = nanoid()

        // Generate initial avatar using username's first word (offline-ready SVG Data URI)
        const defaultAvatar = generateInitialsAvatar(name)

        const newUser: User = {
            id: userId,
            name,
            email,
            image: defaultAvatar,
            password: hashedPassword,
            createdAt: Date.now()
        }

        // Persist user, email index, and username search index atomically
        const pipeline = db.pipeline()
        pipeline.set(`user:${userId}`, JSON.stringify(newUser))
        pipeline.set(`user:email:${email}`, userId)
        pipeline.set(`user:name:${name.toLowerCase().trim()}`, userId)
        pipeline.sadd('users', userId)
        await pipeline.exec()

        // Return sanitized user object without sensitive fields
        return new Response(
            JSON.stringify({
                success: true,
                message: "Account registered successfully",
                user: {
                    id: userId,
                    name,
                    email,
                    image: defaultAvatar
                }
            }),
            {
                status: 201,
                headers: { "Content-Type": "application/json" }
            }
        )
    } catch (error) {
        console.error("Registration error:", error)
        // VAPT Hardening: Generic 500 error prevents leaking internal stack trace or DB details
        return new Response(
            JSON.stringify({ message: "An error occurred during registration. Please try again." }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        )
    }
}

