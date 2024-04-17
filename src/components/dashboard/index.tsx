import { NoContent } from '@/common'
import { chatHrefConstructor } from '@/lib/utils'
import { ChevronRight, ForwardIcon, MessageCircleCode } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { FC } from 'react'

interface friendLastMsg extends User {
    lastMessage: Message | null
}

interface DashboardProps {
    friendsWithLastMsg: friendLastMsg[],
    userId: string
}

const Dashboard: FC<DashboardProps> = ({ friendsWithLastMsg, userId }) => {
    return <div className='container py-12'>
        <h1 className='font-bold text-5xl mb-8'>
            Recent Chats
        </h1>
        {friendsWithLastMsg && friendsWithLastMsg.length === 0 ?
            <NoContent noContentText='Please add your friends to show up here...'/> :
          friendsWithLastMsg && friendsWithLastMsg.map((friend)=>(
          <div key={friend.id} className='relative bg-zinc-50 border border-zinc-200 p-3 rounded-md'>
            <div className="absolute right-4 inset-y-0 flex items-center">
                <ChevronRight size={40} className='h-7 w-7 text-zinc-400'/>
            </div>
            <Link
             href={`/dashboard/chats/${chatHrefConstructor(userId, friend.id)}`}
             className='relative sm:flex sm:items-center'
            >
                <div className="mb-4 flex-shrink-0 sm:mb-0 sm:mr-4">
                    <div className="relative h-6 w-6">
                        <Image referrerPolicy='no-referrer' 
                        className='rounded-full'
                        alt={`${friend.name} profile`}
                        src={friend.image}
                        fill
                        />
                    </div>
                </div>

            <div>
                <h4 className="text-lg font-semibold">
                    {friend.name}
                </h4>
                <p className="mt-1 max-w-md">
                    <span className="text-zinc-400">
                        {friend?.lastMessage?.senderId === userId ? 'You: ' : ''}
                    </span>
                    {friend?.lastMessage?.text}
                </p>
            </div>
            </Link>
          </div>
          ))
        }
    </div>
}

export default Dashboard