"use client"
import { MessageCircleCode, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { Dispatch, FC, SetStateAction } from 'react'
import { Button, DialogUI, SignOutButton, ThemeToggle } from '@/common'
import Image from 'next/image'
import FriendRequestsSideBarOption from '../FriendRequestSideBarOption'
import AddFriendButton from '../dashboard/AddFriendButton'
import ChatList from './ChatList'

interface DashBoardLayoutProps {
  profileImage: string,
  profileName: string,
  profileEmail: string,
  sessionId: string,
  unseenFriendRequests: number,
  friends: User[],
  openAddFriendModal: boolean,
  initialUnreadCounts?: Record<string, number>,
  handleModalStateOpen(): void,
  handleModalStateClose: Dispatch<SetStateAction<boolean>>,
  handleCloseButtonModal(): void
}

const DashboardLayout: FC<DashBoardLayoutProps> = ({ 
  profileImage, 
  profileName, 
  profileEmail,
  sessionId, 
  unseenFriendRequests, 
  friends, 
  handleModalStateClose, 
  handleModalStateOpen, 
  openAddFriendModal, 
  handleCloseButtonModal,
  initialUnreadCounts = {}
}) => {

  return <>
    <div className="hidden md:flex h-full w-full min-w-[22rem] max-w-[22rem] grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6">
      {/* Logo Section */}
      <Link href={`/dashboard`} className='flex h-16 shrink-0 items-center gap-5'>
        <MessageCircleCode size={38} className='text-indigo-600 dark:text-indigo-400' />
        <h1 className='text-2xl font-bold text-slate-800 dark:text-slate-100'>
          Chat+
        </h1>
      </Link>
     {friends && friends.length !==0 && <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
        Your Chats
      </div>}
      {/* nav section begins */}
      <nav className="flex flex-1 flex-col">
        <ul role='list' className='flex flex-1 flex-col gap-y-7'>
          <li>
            <ChatList friends={friends} sessionId={sessionId} initialUnreadCounts={initialUnreadCounts} />
          </li>
          <li>
            <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
              Overview
            </div>

            {/* add friend button */}
            <ul role='list' className='mt-2 space-y-1'>
              <Button onClick={handleModalStateOpen} className='flex gap-3 items-center w-full justify-start px-3 py-2 text-sm'>
                <UserPlus size={16} />
                <span>Add Friend</span>
              </Button>
            </ul>
          </li>

          {/* friend request options */}
          <li>
            <FriendRequestsSideBarOption initialUnseenFriendRequests={unseenFriendRequests} sessionId={sessionId} />
          </li>

          {/* your profile section */}
          <li className="-mx-6 mt-auto flex items-center border-t border-gray-200 dark:border-zinc-800">
            <div className="flex flex-1 items-center gap-x-3 px-6 py-3 text-sm font-semibold leading-6 text-gray-900 dark:text-gray-100">
              <div className="relative h-8 w-8 bg-gray-50 dark:bg-zinc-800 shrink-0">
                <Image src={profileImage} alt={`profile image`} fill
                  referrerPolicy='no-referrer'
                  className='rounded-full'
                />
              </div>
              <span className='sr-only'>
                Your profile
              </span>
              <div className="flex flex-col truncate">
                <span aria-hidden className='truncate text-sm font-medium text-gray-800 dark:text-gray-200'>{profileName}</span>
                <span className='text-xs text-zinc-400 dark:text-zinc-500 truncate' aria-hidden>{profileEmail}</span>
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <ThemeToggle />
                <SignOutButton className='h-full aspect-square' />
              </div>
            </div>
          </li>

        </ul>
      </nav>
      {/* nav section ends */}
    </div>

    {/* add friends dialog box */}
   <DialogUI openDialog={openAddFriendModal} closeHandler={handleModalStateClose} title='Add friend'>
      <AddFriendButton closeModalHandler={handleCloseButtonModal} />
    </DialogUI>
  </>
}
export default DashboardLayout
