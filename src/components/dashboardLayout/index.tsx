"use client"
import MobileChatLayout from '@/common/MobileChatLayout'
import { FC, ReactNode, useState } from 'react'
import DashboardLayout from './DashBoardLayout'

interface DashBoardLayoutIndexProps {
  children: ReactNode
  profileImage: string,
  profileName: string,
  profileEmail: string,
  sessionId: string,
  unseenFriendRequests: number,
  friends: User[]
}

const DashBoardLayoutIndex: FC<DashBoardLayoutIndexProps> = ({ children, friends, profileEmail, profileImage, profileName, sessionId, unseenFriendRequests
}) => {
  const [openAddFriendModal, setopenAddFriendModal] = useState(false)

  //handle modal open
  const handleModalStateOpen = () => {
    setopenAddFriendModal(true)
  }

   //handle modal close
   const handleModalStateClose = () => {
    setopenAddFriendModal(false)
  }

  return <div className='w-full flex h-screen'>
    <div className="md:hidden">
      <MobileChatLayout profileImage={profileImage}
        profileName={profileName}
        profileEmail={profileEmail}
        sessionId={sessionId}
        unseenFriendRequests={+unseenFriendRequests}
        friends={friends}
        handleModalStateOpen={handleModalStateOpen}
      />
    </div>
    <DashboardLayout profileImage={profileImage}
        profileName={profileName}
        profileEmail={profileEmail}
        sessionId={sessionId}
        unseenFriendRequests={+unseenFriendRequests}
        friends={friends}
      openAddFriendModal={openAddFriendModal}
      handleModalStateOpen={handleModalStateOpen}
      handleModalStateClose={setopenAddFriendModal}
      handleCloseButtonModal={handleModalStateClose}
    />
    <aside className='max-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-12 w-full'>
      {children}
    </aside>
  </div>
}

export default DashBoardLayoutIndex