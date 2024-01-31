"use client"
import { LogOut, MessageCircleCode, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { FC, useState } from 'react'
import { Button, Dialog, SignOutButton } from '@/common'
import Image from 'next/image'
import FriendRequestsSideBarOption from '../FriendRequestSideBarOption'
import AddFriendButton from '../dashboard/AddFriendButton'

interface dashBoardLayoutProps {
  profileImage: string,
  profileName: string,
  profileEmail: string,
  sessionId: string,
  unseenFriendRequests: number
}

const DashboardLayout: FC<dashBoardLayoutProps> = ({ profileImage, profileName, profileEmail,sessionId, unseenFriendRequests }) => {

  const [openAddFriendModal, setopenAddFriendModal] = useState(false)

  //handle modal open
  const handleModalStateOpen = () => {
    setopenAddFriendModal(true)
  }

  //handle modal close
  const handleModalStateClose = () => {
    setopenAddFriendModal(false)
  }

  return <>
    <div className="flex h-full w-full max-w-[22rem] grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6">
      {/* Logo Section */}
      <Link href={`/dashboard`} className='flex h-16 shrink-0 items-center gap-5'>
        <MessageCircleCode size={40} color='black' />
        <h1 className='!text-4xl font-bold !text-slate-700'>
          Chat+
        </h1>
      </Link>
      <div className="text-xs font-semibold leading-6 text-gray-400">
        Your Chats
      </div>
      {/* nav section begins */}
      <nav className="flex flex-1 flex-col">
        <ul role='list' className='flex flex-1 flex-col gap-y-7'>
          <li>
            chats
          </li>
          <li>
            <div className="text-xs font-semibold leading-6 text-gray-400">
              Overview
            </div>

            {/* add friend button */}
            <ul role='list' className='mt-2 space-y-1'>
              <Button onClick={handleModalStateOpen} className='flex gap-4 items-center'>
                <UserPlus size={15} />
                <p>
                  Add Friend
                </p>
              </Button>
            </ul>
          </li>

          {/* friend request options */}
          <li>
            <FriendRequestsSideBarOption initialUnseenFriendRequests={unseenFriendRequests} sessionId={sessionId} />
          </li>

          {/* your profile section */}
          <li className="-mx-6 mt-auto flex items-center ">
            <div className="flex flex-1 items-center gap-x-5 px-6 py-3 text-sm font-semibold leading-6 text-gray-900">
              <div className="relative h-8 w-8 bg-gray-50">
                <Image src={profileImage} alt={`profile image`} fill
                  referrerPolicy='no-referrer'
                  className='rounded-full'
                />
              </div>
              <span className='sr-only'>
                Your profile
              </span>
              <div className="flex flex-col">
                <span aria-hidden>{profileName}</span>
                <span className='text-xs text-zinc-400' aria-hidden>{profileEmail}</span>
              </div>
              <SignOutButton className='h-full aspect-square' />
            </div>
          </li>

        </ul>
      </nav>
      {/* nav section ends */}
    </div>

    {/* add friends dialog box */}
    <Dialog open={openAddFriendModal} closeHandler={handleModalStateClose}
      className='absolute top-1/3 shadow-md py-5 rounded-lg backdrop:bg-black/20' title='Add friend'>
      <AddFriendButton closeModalHandler={handleModalStateClose} />
    </Dialog>
  </>
}
export default DashboardLayout