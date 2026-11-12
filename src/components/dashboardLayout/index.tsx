"use client"
import MobileChatLayout from '@/common/MobileChatLayout'
import { FC, ReactNode, useState } from 'react'
import DashboardLayout from './DashBoardLayout'
import AvatarModal from './AvatarModal'

interface DashBoardLayoutIndexProps {
  children: ReactNode
  profileImage: string,
  profileName: string,
  profileEmail: string,
  sessionId: string,
  unseenFriendRequests: number,
  friends: User[],
  initialUnreadCounts?: Record<string, number>
}

const DashBoardLayoutIndex: FC<DashBoardLayoutIndexProps> = ({ 
  children, 
  friends, 
  profileEmail, 
  profileImage, 
  profileName, 
  sessionId, 
  unseenFriendRequests,
  initialUnreadCounts = {}
}) => {
  const [openAddFriendModal, setopenAddFriendModal] = useState(false)
  const [openAvatarModal, setOpenAvatarModal] = useState(false)
  const [currentAvatar, setCurrentAvatar] = useState(profileImage)

  // handle modal open
  const handleModalStateOpen = () => {
    setopenAddFriendModal(true)
  }

  // handle modal close
  const handleModalStateClose = () => {
    setopenAddFriendModal(false)
  }

  const handleOpenAvatarModal = () => {
    setOpenAvatarModal(true)
  }

  return (
    <div className='w-full flex h-screen bg-white dark:bg-zinc-950 text-gray-900 dark:text-gray-100'>
      <div className="md:hidden">
        <MobileChatLayout 
          profileImage={currentAvatar}
          profileName={profileName}
          profileEmail={profileEmail}
          sessionId={sessionId}
          unseenFriendRequests={+unseenFriendRequests}
          friends={friends}
          handleModalStateOpen={handleModalStateOpen}
          openAddFriendModal={openAddFriendModal}
          initialUnreadCounts={initialUnreadCounts}
          onOpenAvatarModal={handleOpenAvatarModal}
        />
      </div>
      <DashboardLayout 
        profileImage={currentAvatar}
        profileName={profileName}
        profileEmail={profileEmail}
        sessionId={sessionId}
        unseenFriendRequests={+unseenFriendRequests}
        friends={friends}
        openAddFriendModal={openAddFriendModal}
        handleModalStateOpen={handleModalStateOpen}
        handleModalStateClose={setopenAddFriendModal}
        handleCloseButtonModal={handleModalStateClose}
        initialUnreadCounts={initialUnreadCounts}
        onOpenAvatarModal={handleOpenAvatarModal}
      />
      <aside className='max-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-12 w-full overflow-y-auto bg-gray-50/50 dark:bg-zinc-950'>
        {children}
      </aside>

      {/* Avatar Customization Modal */}
      <AvatarModal
        isOpen={openAvatarModal}
        onClose={() => setOpenAvatarModal(false)}
        currentImage={currentAvatar}
        userName={profileName}
        userEmail={profileEmail}
        onAvatarUpdated={(newImage) => setCurrentAvatar(newImage)}
      />
    </div>
  )
}

export default DashBoardLayoutIndex
