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
    mediaType: z.enum(['image', 'file', 'video', 'audio', 'video-note']).optional(),
    fileName: z.string().optional(),
    fileSize: z.number().optional(),
    duration: z.number().optional(),
    status: z.enum(['sending', 'sent', 'error']).optional(),
    isSeen: z.boolean().optional(),
    seenAt: z.number().optional(),
    senderName: z.string().optional(),
    senderImg: z.string().optional(),
    replyTo: z.object({
        id: z.string(),
        senderName: z.string(),
        text: z.string().optional(),
        mediaType: z.string().optional()
    }).optional(),
})

export const messageArrayValidator = z.array(messageValidator)

export type Message = z.infer<typeof messageValidator>
