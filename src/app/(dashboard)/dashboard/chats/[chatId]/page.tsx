import Chat from '@/components/Chat'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { messageValidator } from '@/lib/validations/message'
import { generateInitialsAvatar } from '@/lib/avatars'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'

interface PageProps {
  params: {
    chatId: string
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { chatId } = params
  try {
    if (chatId.startsWith('group--')) {
      const groupId = chatId.replace('group--', '')
      const groupRaw = await db.get(`group:${groupId}`)
      if (groupRaw) {
        const group = (typeof groupRaw === 'string' ? JSON.parse(groupRaw) : groupRaw) as Group
        return {
          title: `${group.name} (Group)`,
          description: `Group conversation in ${group.name}`,
        }
      }
    }
  } catch {}

  return {
    title: 'Chat',
    description: 'Real-time conversation on Chat+',
  }
}

async function getChatMessages(chatId: string): Promise<Message[]> {
  try {
    // Fetch only the latest 30 messages initially (bounded query for fast TTFB)
    const result = (await db.zrange(`chat:${chatId}:messages`, -30, -1)) as unknown[]
    const messages: Message[] = []

    // Traverse in reverse so messages[0] is the most recent (compatible with flex-col-reverse)
    for (let i = result.length - 1; i >= 0; i--) {
      const raw = result[i]
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        const validated = messageValidator.parse(parsed)
        messages.push(validated)
      } catch {
        // Skip malformed message records safely
      }
    }

    return messages
  } catch (error) {
    return []
  }
}

const page = async ({ params }: PageProps) => {
  const { chatId } = params

  const session = await getServerSession(authOptions)
  if (!session) return notFound()

  const { user } = session

  // 1. GROUP CHAT RESOLUTION
  if (chatId.startsWith('group--')) {
    const groupId = chatId.replace('group--', '')
    const isMember = (await db.sismember(`group:${groupId}:members`, user.id)) as 0 | 1
    if (!isMember) return notFound()

    const groupRaw = await db.get(`group:${groupId}`)
    if (!groupRaw) return notFound()

    const group = (typeof groupRaw === 'string' ? JSON.parse(groupRaw) : groupRaw) as Group

    const initialMessages = await getChatMessages(chatId)

    const groupVirtualPartner: User = {
      id: `group--${group.id}`,
      name: group.name,
      email: `${group.memberIds.length} members in group`,
      image: group.image || generateInitialsAvatar(group.name, '#8b5cf6', '#ec4899')
    }

    return (
      <Chat
        chatPartner={groupVirtualPartner}
        chatId={chatId}
        initialMessages={initialMessages}
        sessionId={session.user.id}
        sessionImg={session.user.image || ''}
        initialGroup={group}
      />
    )
  }

  // 2. 1-ON-1 DIRECT CHAT RESOLUTION
  const ids = chatId.split('--')
  if (ids.length !== 2) return notFound()
  const [userId1, userId2] = ids

  if (user.id !== userId1 && user.id !== userId2) return notFound()

  const chatPartnerId = user.id === userId1 ? userId2 : userId1

  const isFriend = (await db.sismember(`user:${user.id}:friends`, chatPartnerId)) as 0 | 1
  if (!isFriend) return notFound()

  const chatPartnerRaw = await db.get(`user:${chatPartnerId}`)
  if (!chatPartnerRaw) return notFound()

  const chatPartner = (typeof chatPartnerRaw === 'string'
    ? JSON.parse(chatPartnerRaw)
    : chatPartnerRaw) as User

  const initialMessages = await getChatMessages(chatId)

  return (
    <Chat 
      chatPartner={chatPartner} 
      chatId={chatId}
      initialMessages={initialMessages}
      sessionId={session.user.id}
      sessionImg={session.user.image || ''}
    />
  )
}

export default page
