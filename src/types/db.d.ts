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
    },
    isPinned?: boolean,
    pinnedAt?: number,
    pinnedBy?: string,
    expiresAt?: number,
    mentions?: string[]
}

interface GroupSettings {
    onlyAdminsCanEditInfo: boolean,
    onlyAdminsCanAddMembers: boolean,
    onlyAdminsCanSendMessages: boolean,
    approvalRequired: boolean
    disappearingMessagesSeconds?: number
    onlyAdminsCanPinMessages?: boolean
    onlyAdminsCanCreatePolls?: boolean
    onlyAdminsCanCreateEvents?: boolean
    announcementsOnly?: boolean
    allowMemberInvites?: boolean
}

interface Group {
    id: string,
    name: string,
    creatorId: string,
    adminIds?: string[],
    memberIds: string[],
    description?: string,
    image?: string,
    createdAt: number,
    updatedAt?: number,
    lastMessage?: string,
    settings?: GroupSettings
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
