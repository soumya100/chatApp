interface User {
    name: string,
    email: string,
    image: string,
    id: string,
    password?: string,
    createdAt?: number
}

interface Message {
    id: string,
    senderId: string,
    receiverId: string,
    text: string,
    timestamp: number,
    isEdited?: boolean,
    isDeleted?: boolean,
    reactions?: Record<string, string[]>,
    mediaUrl?: string,
    mediaType?: 'image' | 'file' | 'video' | 'audio' | 'video-note',
    fileName?: string,
    fileSize?: number,
    duration?: number,
    status?: 'sending' | 'sent' | 'error',
    isSeen?: boolean,
    seenAt?: number,
    senderName?: string,
    senderImg?: string,
    replyTo?: {
        id: string,
        senderName: string,
        text?: string,
        mediaType?: string
    }
}

interface Group {
    id: string,
    name: string,
    creatorId: string,
    memberIds: string[],
    description?: string,
    image?: string,
    createdAt: number,
    lastMessage?: string
}

interface Chat {
    id: string,
    messages: Message[]
}

interface FriendRequest {
    id: string,
    senderId: string,
    receiverId: string
}
