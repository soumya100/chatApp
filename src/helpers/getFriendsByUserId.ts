import { db } from "@/lib/db"

export const getFriendsByUserId = async (userId: string): Promise<User[]> => {
    // 1. Get friend IDs set
    const friendIds = (await db.smembers(`user:${userId}:friends`)) as string[]

    if (!friendIds || friendIds.length === 0) {
        return []
    }

    // 2. Batch fetch all friend profiles in a single round-trip pipeline
    const pipeline = db.pipeline()
    for (const friendId of friendIds) {
        pipeline.get(`user:${friendId}`)
    }
    const rawFriends = await pipeline.exec()

    const friends: User[] = []
    for (const raw of rawFriends) {
        if (!raw) continue
        try {
            const user = (typeof raw === 'string' ? JSON.parse(raw) : raw) as User
            if (user && user.id) {
                friends.push(user)
            }
        } catch {
            // Skip corrupted user profile JSON
        }
    }

    return friends
}
