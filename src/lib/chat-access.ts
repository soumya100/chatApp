/** Enforce current chat access before any message read or mutation. */
type ChatAccessRedis = {
    sismember(key: string, member: string): Promise<number | boolean>
}

export async function hasCurrentChatAccess(db: ChatAccessRedis, chatId: string, userId: string): Promise<boolean> {
    if (!userId || !chatId || chatId.length > 256) return false
    if (chatId.startsWith("group--")) {
        const groupId = chatId.slice("group--".length)
        return Boolean(groupId) && Number(await db.sismember(`group:${groupId}:members`, userId)) === 1
    }
    const ids = chatId.split("--")
    if (ids.length !== 2 || !ids[0] || !ids[1] || !ids.includes(userId)) return false
    const friendId = ids[0] === userId ? ids[1] : ids[0]
    return Number(await db.sismember(`user:${userId}:friends`, friendId)) === 1
}
