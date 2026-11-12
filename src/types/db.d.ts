interface User {
    name: string,
    email: string,
    image: string,
    id: string
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
    mediaType?: 'image' | 'file',
    fileName?: string,
    fileSize?: number
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
