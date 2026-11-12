import { z } from "zod";

export const messageValidator = z.object({
    id: z.string(),
    senderId: z.string(),
    text: z.string().max(2000),
    timestamp: z.number(),
    receiverId: z.string(),
    isEdited: z.boolean().optional(),
    isDeleted: z.boolean().optional(),
    reactions: z.record(z.string(), z.array(z.string())).optional(),
    mediaUrl: z.string().optional(),
    mediaType: z.enum(['image', 'file']).optional(),
    fileName: z.string().optional(),
    fileSize: z.number().optional()
})

export const messageArrayValidator = z.array(messageValidator)

export type Message = z.infer<typeof messageValidator>
