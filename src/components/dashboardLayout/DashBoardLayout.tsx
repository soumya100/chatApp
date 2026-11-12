"use client"
import { Camera, MessageCircleCode, UserPlus, Users } from 'lucide-react'
import Link from 'next/link'
import { Dispatch, FC, SetStateAction, useState } from 'react'
import { Avatar, Button, DialogUI, SignOutButton, ThemeToggle } from '@/common'
import FriendRequestsSideBarOption from '../FriendRequestSideBarOption'
import AddFriendButton from '../dashboard/AddFriendButton'
import ChatList from './ChatList'
import CreateGroupModal from './CreateGroupModal'

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
  handleCloseButtonModal(): void,
  onOpenAvatarModal?: () => void
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
  initialUnreadCounts = {},
  onOpenAvatarModal
}) => {
  const [openGroupModal, setOpenGroupModal] = useState<boolean>(false)

  return <>
    <div className="hidden md:flex h-full w-full min-w-[22rem] max-w-[22rem] grow flex-col gap-y-5 overflow-y-auto overflow-x-hidden border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6">
      {/* Logo Section */}
      <Link href={`/dashboard`} className='flex h-16 shrink-0 items-center gap-5'>
        <MessageCircleCode size={38} className='text-indigo-600 dark:text-indigo-400' />
        <h1 className='text-2xl font-bold text-slate-800 dark:text-slate-100'>
          Chat+
        </h1>
      </Link>
     {friends && friends.length !== 0 && <div className="text-xs font-semibold leading-6 text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
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

            {/* overview actions */}
            <ul role='list' className='mt-2 space-y-2'>
              <Button onClick={handleModalStateOpen} className='flex gap-3 items-center w-full justify-start px-3 py-2 text-sm'>
                <UserPlus size={16} />
                <span>Add Friend</span>
              </Button>
              <Button 
                onClick={() => setOpenGroupModal(true)} 
                variant='ghost' 
                className='flex gap-3 items-center w-full justify-start px-3 py-2 text-sm border border-dashed border-gray-300 dark:border-zinc-700 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400'
              >
                <Users size={16} />
                <span>Create Group</span>
              </Button>
            </ul>
          </li>

          {/* friend request options */}
          <li>
            <FriendRequestsSideBarOption initialUnseenFriendRequests={unseenFriendRequests} sessionId={sessionId} />
          </li>

          {/* your profile section */}
          <li className="-mx-6 mt-auto flex items-center border-t border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="flex flex-1 items-center gap-x-3 px-6 py-3 text-sm font-semibold leading-6 text-gray-900 dark:text-gray-100 min-w-0">
              {/* Interactive Avatar Button */}
              <button
                type="button"
                onClick={onOpenAvatarModal}
                className="relative group shrink-0 rounded-full focus:outline-none cursor-pointer"
                title="Click to customize avatar"
              >
                <Avatar
                  src={profileImage}
                  name={profileName}
                  sizeClassName="w-9 h-9"
                  textClassName="text-sm font-bold text-white"
                  className="ring-2 ring-transparent group-hover:ring-indigo-500 transition shadow-sm"
                />
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </div>
              </button>

              <span className='sr-only'>
                Your profile
              </span>

              <div 
                onClick={onOpenAvatarModal}
                className="flex flex-col truncate min-w-0 flex-1 cursor-pointer hover:opacity-80 transition"
                title="Click to customize avatar"
              >
                <span aria-hidden className='truncate text-sm font-medium text-gray-800 dark:text-gray-200'>{profileName}</span>
                <span className='text-xs text-zinc-400 dark:text-zinc-500 truncate' aria-hidden>{profileEmail}</span>
              </div>

              <div className="flex items-center gap-1 ml-auto shrink-0">
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

   {/* create group modal */}
   <CreateGroupModal
     isOpen={openGroupModal}
     onClose={() => setOpenGroupModal(false)}
     friends={friends}
     sessionId={sessionId}
   />
  </>
}

export default DashboardLayout
