import { authOptions } from '@/lib/auth'
import { pusherServer } from '@/lib/pusher'
import { getServerSession } from 'next-auth'

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response('Unauthorized', { status: 401 })
        }

        const contentType = req.headers.get('content-type') || ''
        let socketId = ''
        let channelName = ''

        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await req.formData()
            socketId = formData.get('socket_id')?.toString() || ''
            channelName = formData.get('channel_name')?.toString() || ''
        } else {
            const body = await req.json().catch(() => ({}))
            socketId = body.socket_id || ''
            channelName = body.channel_name || ''
        }

        if (!socketId || !channelName) {
            return new Response('Missing socket_id or channel_name', { status: 400 })
        }

        const isPresence = channelName.startsWith('presence-')

        // Authorization checks
        if (channelName.startsWith('private-user__')) {
            const userId = channelName.replace('private-user__', '').split('__')[0]
            if (userId !== session.user.id) {
                return new Response('Forbidden', { status: 403 })
            }
        } else if (channelName.startsWith('private-chat__') || channelName.startsWith('presence-chat__')) {
            const prefix = channelName.startsWith('presence-') ? 'presence-chat__' : 'private-chat__'
            const chatId = channelName.replace(prefix, '')
            const [userId1, userId2] = chatId.split('--')
            if (session.user.id !== userId1 && session.user.id !== userId2) {
                return new Response('Forbidden', { status: 403 })
            }
        } else if (channelName.startsWith('presence-online-users')) {
            // All authenticated users can join global presence
        }

        const presenceData = isPresence
            ? {
                user_id: session.user.id,
                user_info: {
                    name: session.user.name || '',
                    email: session.user.email || '',
                    image: session.user.image || '',
                },
            }
            : undefined

        const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData)
        return new Response(JSON.stringify(authResponse), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('Pusher auth error:', error)
        return new Response('Internal Server Error', { status: 500 })
    }
}
