import DashboardLayout from '@/components/dashboardLayout';
import { getFriendsByUserId } from '@/helpers/getFriendsByUserId';
import { fetchRedis } from '@/helpers/redis';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react'

interface LayoutProps {
    children: ReactNode;
}



const Layout = async ({ children }: LayoutProps) => {

    const session = await getServerSession(authOptions)

    if (!session) notFound()

    const unseenFriendRequestCount = (await fetchRedis('smembers',
        `user:${session.user.id}:incoming_friend_requests`
    ) as User[]
    )?.length

    const friends = await getFriendsByUserId(session.user.id)


    return <div className='w-full flex h-screen'>
        <DashboardLayout profileImage={session.user.image || ''}
            profileName={session.user.name || ''}
            profileEmail={session.user.email || ''}
            sessionId={session.user.id || ''}
            unseenFriendRequests={+unseenFriendRequestCount}
            friends={friends}
        />
        {children}
    </div>
}

export default Layout