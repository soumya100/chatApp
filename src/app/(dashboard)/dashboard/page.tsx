import Button from '@/common/Button'
import Dashboard from '@/components/dashboard'
import { getFriendsByUserId } from '@/helpers/getFriendsByUserId'
import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { chatHrefConstructor } from '@/lib/utils'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'

const page = async ({}) => {
  const session = await getServerSession(authOptions)
  if (!session) return notFound()

  const friends = await getFriendsByUserId(session.user.id)

  const friendsWithLastMsg = await Promise.all(
    friends.map(async (friend) => {
      const [lastMessageRaw] = await fetchRedis(
        'zrange',
        `chat:${chatHrefConstructor(session.user.id, friend.id)}:messages`,
        -1,
        -1
      ) as string[]

      // Check if lastMessageRaw is defined before parsing
      const lastMessage = lastMessageRaw ? JSON.parse(lastMessageRaw) as Message : null

      return {
        ...friend,
        lastMessage
      }
    })
  )

  return <Dashboard friendsWithLastMsg={friendsWithLastMsg} userId={session.user.id} />
}

export default page
