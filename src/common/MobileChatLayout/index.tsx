'use client'
import { FC, Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Menu, MessageCircleCode, UserPlus, X } from 'lucide-react'
import Link from 'next/link';
import Button, { buttonVariants } from '../Button';
import SignOutButton from '../SignoutButton';
import Image from 'next/image';
import FriendRequestsSideBarOption from '@/components/FriendRequestSideBarOption';
import ChatList from '@/components/dashboardLayout/ChatList';

interface MobileChatLayoutProps {
  profileImage: string,
  profileName: string,
  profileEmail: string,
  sessionId: string,
  unseenFriendRequests: number,
  friends: User[]
  handleModalStateOpen(): void
}

const MobileChatLayout: FC<MobileChatLayoutProps> = ({friends,profileEmail, profileImage, profileName, 
  sessionId, unseenFriendRequests, handleModalStateOpen }) => {
  const [open, setOpen] = useState<boolean>(false);
  return <div className='fixed bg-zinc-50 border-b border-zinc-200 top-0 inset-x-0 py-2 px-4'>
    <div className='w-full flex justify-between items-center'>
      <Link href={`/dashboard`} className='flex h-14 shrink-0 items-center gap-5'>
        <MessageCircleCode size={40} color='black' />
        <h1 className='!text-3xl font-bold !text-slate-700'>
          Chat+
        </h1>
      </Link>
      <Button onClick={() => setOpen(true)} className='gap-4'>
        Menu <Menu className='h-6 w-6' />
      </Button>
    </div>
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={setOpen}>
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-500"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-500"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-500 sm:duration-700"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500 sm:duration-700"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto relative w-screen max-w-md">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-500"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-500"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute left-0 top-0 -ml-8 flex pr-2 pt-4 sm:-ml-10 sm:pr-4">
                      <button
                        type="button"
                        className="relative rounded-md text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                        onClick={() => setOpen(false)}
                      >
                        <span className="absolute -inset-2.5" />
                        <span className="sr-only">Close panel</span>
                        <X className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                  </Transition.Child>
                  <div className="flex h-full flex-col overflow-y-scroll bg-white py-6 shadow-xl">
                    <div className="px-4 sm:px-6">
                      <Dialog.Title className="text-base font-semibold leading-6 text-gray-900">
                        Panel title
                      </Dialog.Title>
                    </div>
                    <div className="relative mt-6 flex-1 px-4 sm:px-6">
                      {friends && friends.length !== 0 && <div className="text-xs font-semibold leading-6 text-gray-400">
                        Your Chats
                      </div>}
                      {/* nav section begins */}
                      <nav className="flex flex-1 flex-col w-full justify-between h-full">
                        <ul role='list' className='flex flex-1 flex-col gap-y-7'>
                          <div className='space-y-5'>
                          <li>
                            <ChatList friends={friends} sessionId={sessionId} />
                          </li>
                          <li>
                            <div className="text-xs font-semibold leading-6 text-gray-400">
                              Overview
                            </div>

                            {/* add friend button */}
                            <ul role='list' className='mt-2 space-y-1'>
                              <Button onClick={handleModalStateOpen} className='flex gap-4 items-center w-full'>
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
                          </div>

                          {/* your profile section */}
                          <li className="-mx-6 mt-auto flex items-center w-full justify-between">
                            <div className="flex flex-1 items-center justify-between px-6 py-3 text-sm font-semibold leading-6 text-gray-900 w-full">
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
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  </div>
}

export default MobileChatLayout