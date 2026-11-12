import { z } from "zod"

// VAPT Input Sanitization: Removes dangerous HTML/script tags from strings
export function sanitizeText(text: string): string {
    return text
        .replace(/<[^>]*>?/gm, "") // Strip HTML tags
        .replace(/[<>"'&]/g, (match) => {
            const entities: Record<string, string> = {
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#x27;",
                "&": "&amp;",
            }
            return entities[match] || match
        })
        .trim()
}

export const registerSchema = z.object({
    name: z
        .string()
        .min(2, { message: "Name must be at least 2 characters long" })
        .max(50, { message: "Name cannot exceed 50 characters" })
        .transform((val) => sanitizeText(val)),
    email: z
        .string()
        .email({ message: "Please provide a valid email address" })
        .max(100, { message: "Email cannot exceed 100 characters" })
        .toLowerCase()
        .trim(),
    password: z
        .string()
        .min(8, { message: "Password must be at least 8 characters long" })
        .max(72, { message: "Password cannot exceed 72 characters" })
        .regex(/[A-Z]/, { message: "Password must include at least one uppercase letter" })
        .regex(/[a-z]/, { message: "Password must include at least one lowercase letter" })
        .regex(/[0-9]/, { message: "Password must include at least one number" })
        .regex(/[^A-Za-z0-9]/, { message: "Password must include at least one special character" }),
})

export const loginSchema = z.object({
    email: z
        .string()
        .email({ message: "Please provide a valid email address" })
        .toLowerCase()
        .trim(),
    password: z
        .string()
        .min(1, { message: "Password is required" })
        .max(72, { message: "Password cannot exceed 72 characters" }),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>

