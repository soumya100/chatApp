import FriendRequests from '@/components/FriendRequests'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Friend Requests',
    description: 'Manage incoming and pending friend requests on Chat+.',
}

const page = async ({}) => {
    const session = await getServerSession(authOptions)
    if (!session) return notFound()

    // Fetch IDs of people who sent friend requests to the logged-in user
    const incomingSenderIds = (await db.smembers(
        `user:${session.user.id}:incoming_friend_requests`
    )) as string[]

    if (!incomingSenderIds || incomingSenderIds.length === 0) {
        return <FriendRequests incomingFriendRequests={[]} sessionId={session.user.id} />
    }

    // Batch fetch all requester profiles in a single pipeline round-trip
    const pipeline = db.pipeline()
    for (const senderId of incomingSenderIds) {
        pipeline.get(`user:${senderId}`)
    }
    const sendersRaw = await pipeline.exec()

    const incomingFriendRequests: IncomingFriendRequest[] = []
    for (let i = 0; i < incomingSenderIds.length; i++) {
        const raw = sendersRaw[i]
        if (!raw) continue
        try {
            const sender = (typeof raw === 'string' ? JSON.parse(raw) : raw) as User
            if (sender && sender.email) {
                incomingFriendRequests.push({
                    senderId: incomingSenderIds[i],
                    senderEmail: sender.email,
                    senderName: sender.name,
                    senderImage: sender.image,
                })
            }
        } catch {
            // Ignore malformed sender profile
        }
    }

    return <FriendRequests incomingFriendRequests={incomingFriendRequests} sessionId={session.user.id} />
}

export default page
