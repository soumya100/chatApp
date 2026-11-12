import Chat from '@/components/Chat';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { messageValidator } from '@/lib/validations/message';
import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';

interface PageProps {
  params: {
    chatId: string,
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
  const { chatId } = params;

  const session = await getServerSession(authOptions)
  if (!session) return notFound()

  const { user } = session;

  // Split and validate user IDs
  const ids = chatId.split('--')
  if (ids.length !== 2) return notFound()
  const [userId1, userId2] = ids

  // Verify the current user is a participant
  if (user.id !== userId1 && user.id !== userId2) return notFound()

  const chatPartnerId = user.id === userId1 ? userId2 : userId1

  // Verify both users are currently friends
  const isFriend = (await db.sismember(`user:${user.id}:friends`, chatPartnerId)) as 0 | 1
  if (!isFriend) return notFound()

  // Fetch partner profile safely
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
