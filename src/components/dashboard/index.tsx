import { NoContent } from '@/common'
import { chatHrefConstructor } from '@/lib/utils'
import { ChevronRight, FileText, ImageIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { FC } from 'react'

interface FriendLastMsg extends User {
  lastMessage: Message | null
}

interface DashboardProps {
  friendsWithLastMsg: FriendLastMsg[]
  userId: string
}

const Dashboard: FC<DashboardProps> = ({ friendsWithLastMsg, userId }) => {
  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10'>
      <h1 className='font-bold text-4xl mb-8 text-slate-800 dark:text-slate-100 tracking-tight'>
        Recent Chats
      </h1>
      {friendsWithLastMsg && friendsWithLastMsg.length === 0 ? (
        <NoContent noContentText='Please add your friends to show up here...' />
      ) : (
        <div className='grid gap-3'>
          {friendsWithLastMsg &&
            friendsWithLastMsg.map((friend) => (
              <div
                key={friend.id}
                className='relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-600 p-4 rounded-xl shadow-xs transition-all'
              >
                <div className='absolute right-4 inset-y-0 flex items-center pointer-events-none'>
                  <ChevronRight size={24} className='text-zinc-400 dark:text-zinc-600' />
                </div>
                <Link
                  href={`/dashboard/chats/${chatHrefConstructor(userId, friend.id)}`}
                  className='relative sm:flex sm:items-center'
                >
                  <div className='mb-3 flex-shrink-0 sm:mb-0 sm:mr-4'>
                    <div className='relative h-11 w-11'>
                      <Image
                        referrerPolicy='no-referrer'
                        className='rounded-full'
                        alt={`${friend.name} profile`}
                        src={friend.image}
                        fill
                      />
                    </div>
                  </div>

                  <div className='truncate pr-8'>
                    <h4 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                      {friend.name}
                    </h4>
                    <p className='mt-0.5 max-w-md text-sm text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5'>
                      <span className='text-zinc-400 dark:text-zinc-500 font-medium'>
                        {friend?.lastMessage?.senderId === userId ? 'You: ' : ''}
                      </span>
                      {friend?.lastMessage?.mediaUrl && !friend.lastMessage.text && (
                        <span className='inline-flex items-center gap-1 italic'>
                          {friend.lastMessage.mediaType === 'image' ? (
                            <>
                              <ImageIcon size={14} /> Photo
                            </>
                          ) : (
                            <>
                              <FileText size={14} /> File
                            </>
                          )}
                        </span>
                      )}
                      <span>{friend?.lastMessage?.text || (friend.lastMessage?.mediaUrl ? '' : 'No messages yet')}</span>
                    </p>
                  </div>
                </Link>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

export default Dashboard
