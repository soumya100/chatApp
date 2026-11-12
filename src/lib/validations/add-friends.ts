import { z } from 'zod'

export const addFriendValidator = z.object({
    email: z
        .string()
        .min(2, { message: "Please enter at least 2 characters (email or username)" })
        .max(100, { message: "Identifier cannot exceed 100 characters" })
        .trim()
})
