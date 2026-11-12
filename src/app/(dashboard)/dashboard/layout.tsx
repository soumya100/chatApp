import DashBoardLayoutIndex from '@/components/dashboardLayout';
import { getFriendsByUserId } from '@/helpers/getFriendsByUserId';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

interface LayoutProps {
    children: ReactNode
}

const Layout = async ({ children }: LayoutProps) => {
    const session = await getServerSession(authOptions)
    if (!session) notFound()

    // Batch fetch incoming requests count, unread counts, and friends in parallel
    const [incomingRequests, initialUnreadCounts, friends] = await Promise.all([
        db.smembers(`user:${session.user.id}:incoming_friend_requests`) as Promise<string[]>,
        db.hgetall<Record<string, number>>(`user:${session.user.id}:unread`),
        getFriendsByUserId(session.user.id)
    ])

    const unseenFriendRequestCount = incomingRequests?.length || 0

    return (
        <DashBoardLayoutIndex 
            friends={friends} 
            profileEmail={session.user.email || ''} 
            profileImage={session.user.image || ''} 
            profileName={session.user.name || ''}
            sessionId={session.user.id || ''} 
            unseenFriendRequests={unseenFriendRequestCount}
            initialUnreadCounts={initialUnreadCounts || {}}
        >
            {children}
        </DashBoardLayoutIndex>
    )
}

export default Layout
