import Dashboard from '@/components/dashboard'
import { getFriendsByUserId } from '@/helpers/getFriendsByUserId'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { chatHrefConstructor } from '@/lib/utils'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'View your conversations, active friends, and recent messages on Chat+.',
}

interface FriendWithLastMsg extends User {
  lastMessage: Message | null
}

const page = async ({}) => {
  const session = await getServerSession(authOptions)
  if (!session) return notFound()

  const friends = await getFriendsByUserId(session.user.id)

  if (friends.length === 0) {
    return <Dashboard friendsWithLastMsg={[]} userId={session.user.id} />
  }

  // Batch fetch the last message for all friends in a single pipeline round-trip
  const pipeline = db.pipeline()
  for (const friend of friends) {
    pipeline.zrange(`chat:${chatHrefConstructor(session.user.id, friend.id)}:messages`, -1, -1)
  }
  const lastMessagesRaw = await pipeline.exec()

  const friendsWithLastMsg: FriendWithLastMsg[] = friends.map((friend, idx) => {
    const rawResult = lastMessagesRaw[idx]
    let lastMessage: Message | null = null

    if (Array.isArray(rawResult) && rawResult.length > 0) {
      const raw = rawResult[0]
      try {
        lastMessage = typeof raw === 'string' ? (JSON.parse(raw) as Message) : (raw as Message)
      } catch {
        lastMessage = null
      }
    }

    return {
      ...friend,
      lastMessage
    }
  })

  // Sort recent chats chronologically: most recent activity at the top
  friendsWithLastMsg.sort((a, b) => {
    const timeA = a.lastMessage?.timestamp || 0
    const timeB = b.lastMessage?.timestamp || 0
    return timeB - timeA
  })

  return <Dashboard friendsWithLastMsg={friendsWithLastMsg} userId={session.user.id} />
}

export default page
