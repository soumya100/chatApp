"use client"
import { Avatar } from '@/common'
import { FC, useEffect, useRef, useState } from 'react'
import Messages from './Messages'
import ChatInput from './ChatInput'
import { pusherClient } from '@/lib/pusher'
import { toPusherKey } from '@/lib/utils'
import { memberInvitesAllowed, resolveAdminIds } from '@/lib/group'
import { Search, UserPlus, X, Settings as SettingsIcon, Sparkles, Users } from 'lucide-react'
import axios from 'axios'
import { nanoid } from 'nanoid'
import toast from 'react-hot-toast'
import dynamic from 'next/dynamic'
import PinnedMessagesBanner from './PinnedMessagesBanner'
import { useRouter } from 'next/navigation'

// The group dialogs are only ever mounted after a user action, so they load
// lazily and keep their markup out of the first-load chat chunk.
const AddGroupMembersModal = dynamic(() => import('./AddGroupMembersModal'), { ssr: false })
const GroupSettingsModal = dynamic(() => import('./GroupSettingsModal'), { ssr: false })
const GroupFeaturesPanel = dynamic(() => import('./GroupFeaturesPanel'), { ssr: false })
const GroupMembersManager = dynamic(() => import('./GroupMembersManager'), { ssr: false })

interface ChatProps {
  chatPartner: User
  initialMessages: Message[]
  sessionId: string
  chatId: string
  sessionImg: string
  initialGroup?: Group
}

const Chat: FC<ChatProps> = ({
  chatPartner,
  initialMessages,
  sessionId,
  chatId,
  sessionImg,
  initialGroup,
}) => {
  const router = useRouter()
  const isGroupChat = chatId.startsWith('group--')
  const [group, setGroup] = useState<Group | undefined>(initialGroup)
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false)
  const [isGroupFeaturesOpen, setIsGroupFeaturesOpen] = useState(false)
  const [isMembersManagerOpen, setIsMembersManagerOpen] = useState(false)
  const groupId = isGroupChat ? chatId.replace('group--', '') : ''
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [isPartnerOnline, setIsPartnerOnline] = useState<boolean>(false)
  const [typingUserIds, setTypingUserIds] = useState<string[]>([])
  const isTyping = typingUserIds.length > 0
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [isAddMembersModalOpen, setIsAddMembersModalOpen] = useState(false)
  const [existingMemberIds, setExistingMemberIds] = useState<string[]>(
    initialGroup?.memberIds || []
  )
  const [memberCount, setMemberCount] = useState<number>(
    initialGroup?.memberIds?.length || 0
  )
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const jumpToPinnedMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`)
    if (!element) {
      toast("This message is not in the currently loaded history")
      return
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  useEffect(() => {
    setTypingUserIds([])
    // 1. Presence channel for tracking active partner in chat room
    const presenceChannelKey = toPusherKey(`presence-chat:${chatId}`)
    const presenceChannel = pusherClient.subscribe(presenceChannelKey) as any

    presenceChannel.bind('pusher:subscription_succeeded', (members: any) => {
      setIsPartnerOnline(Boolean(members.get(chatPartner.id)))
    })

    presenceChannel.bind('pusher:member_added', (member: any) => {
      if (member.id === chatPartner.id) {
        setIsPartnerOnline(true)
      }
    })

    presenceChannel.bind('pusher:member_removed', (member: any) => {
      if (member.id === chatPartner.id) {
        setIsPartnerOnline(false)
      }
    })

    // 2. Private channel for typing indicators
    const privateChannelKey = toPusherKey(`private-chat:${chatId}`)
    const privateChannel = pusherClient.subscribe(privateChannelKey)
    const userGroupsChannelKey = isGroupChat ? toPusherKey(`private-user:${sessionId}:groups`) : null
    const userGroupsChannel = userGroupsChannelKey ? pusherClient.subscribe(userGroupsChannelKey) : null

    const groupRemovedHandler = ({ groupId: removedGroupId }: { groupId: string }) => {
      if (removedGroupId !== groupId) return
      toast.error("You were removed from this group")
      pusherClient.unsubscribe(presenceChannelKey)
      pusherClient.unsubscribe(privateChannelKey)
      if (userGroupsChannelKey) pusherClient.unsubscribe(userGroupsChannelKey)
      router.push("/dashboard/chats")
    }

    const typingHandler = ({ userId, isTyping: typingState }: { userId: string; isTyping: boolean }) => {
      if (userId === sessionId || (!isGroupChat && userId !== chatPartner.id)) return

      setTypingUserIds(previous =>
        typingState
          ? (previous.includes(userId) ? previous : [...previous, userId])
          : previous.filter(id => id !== userId)
      )

      const existingTimeout = typingTimeoutsRef.current.get(userId)
      if (existingTimeout) clearTimeout(existingTimeout)
      typingTimeoutsRef.current.delete(userId)

      if (typingState) {
        const timeout = setTimeout(() => {
          setTypingUserIds(previous => previous.filter(id => id !== userId))
          typingTimeoutsRef.current.delete(userId)
        }, 3000)
        typingTimeoutsRef.current.set(userId, timeout)
      }
    }

    const applyGroupUpdate = (updatedGroup?: Group) => {
      if (!updatedGroup?.memberIds) return
      setGroup(updatedGroup)
      setExistingMemberIds(updatedGroup.memberIds)
      setMemberCount(updatedGroup.memberIds.length)
    }

    const groupUpdatedHandler = (updatedGroup: Group) => applyGroupUpdate(updatedGroup)
    const groupMembersUpdatedHandler = (payload: { group?: Group; updatedGroup?: Group }) => {
      applyGroupUpdate(payload.group || payload.updatedGroup)
    }
    const groupDeletedHandler = () => {
      toast.error("This group is no longer available")
      router.push("/dashboard/chats")
    }

    privateChannel.bind('user_typing', typingHandler)
    privateChannel.bind('group_updated', groupUpdatedHandler)
    privateChannel.bind('group_deleted', groupDeletedHandler)
    privateChannel.bind('group_members_updated', groupMembersUpdatedHandler)
    userGroupsChannel?.bind('group_removed', groupRemovedHandler)

    return () => {
      pusherClient.unsubscribe(presenceChannelKey)
      pusherClient.unsubscribe(privateChannelKey)
      privateChannel.unbind('user_typing', typingHandler)
      privateChannel.unbind('group_updated', groupUpdatedHandler)
      privateChannel.unbind('group_deleted', groupDeletedHandler)
      privateChannel.unbind('group_members_updated', groupMembersUpdatedHandler)
      userGroupsChannel?.unbind('group_removed', groupRemovedHandler)
      if (userGroupsChannelKey) pusherClient.unsubscribe(userGroupsChannelKey)
      typingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
      typingTimeoutsRef.current.clear()
    }
  }, [chatId, chatPartner.id, groupId, isGroupChat, router, sessionId])

  // Optimistic message sending handler
  const handleSendMessage = async (text: string, mediaPayload: any = {}) => {
    const tempId = `temp-${Date.now()}-${nanoid(6)}`
    const optimisticMessage: Message = {
      id: tempId,
      senderId: sessionId,
      receiverId: chatPartner.id,
      text,
      timestamp: Date.now(),
      status: 'sending',
      isSeen: false,
      ...mediaPayload,
    }

    // 1. Immediate optimistic addition to UI
    setMessages((prev) => [optimisticMessage, ...prev])

    try {
      // 2. Dispatch network request
      const response = await axios.post<Message>('/api/message/send', {
        text,
        chatId,
        ...mediaPayload,
      })

      // 3. Mark as sent and reconcile with server payload
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, ...response.data, status: 'sent' } : msg
        )
      )
    } catch (error: any) {
      // Keep the failed optimistic row visible, but reject the promise so the
      // composer does not clear its draft. The user can retry from either
      // surface without silently losing the original text/attachment.
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...msg, status: 'error' } : msg))
      )
      throw error
    }
  }

  // Retry sending an errored message
  const handleRetryMessage = async (failedMsg: Message) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === failedMsg.id ? { ...msg, status: 'sending' } : msg))
    )

    try {
      const response = await axios.post<Message>('/api/message/send', {
        text: failedMsg.text,
        chatId,
        mediaUrl: failedMsg.mediaUrl,
        mediaType: failedMsg.mediaType,
        fileName: failedMsg.fileName,
        fileSize: failedMsg.fileSize,
      })

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === failedMsg.id ? { ...msg, ...response.data, status: 'sent' } : msg
        )
      )
      toast.success('Message sent!')
    } catch {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === failedMsg.id ? { ...msg, status: 'error' } : msg))
      )
      toast.error('Retry failed. Please check connection.')
    }
  }

  return (
    <div className='flex flex-1 justify-between flex-col h-full max-h-[calc(100vh-6rem)]'>
      {/* Header */}
      <div className='flex sm:items-center justify-between py-3 border-b-2 border-gray-200 dark:border-zinc-800 px-5 bg-white dark:bg-zinc-900'>
        <div className='relative flex items-center space-x-4'>
          <div className='relative'>
            <div className='relative w-9 sm:w-12 h-9 sm:h-12'>
              <Avatar
                src={chatPartner.image}
                name={chatPartner.name}
                sizeClassName="w-9 sm:w-12 h-9 sm:h-12"
                textClassName="text-sm sm:text-base font-bold text-white"
              />
            </div>
            {/* Real-time online indicator dot */}
            {!chatId.startsWith('group--') && (
              <span
                className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                  isPartnerOnline ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-600'
                }`}
                title={isPartnerOnline ? 'Online' : 'Offline'}
              />
            )}
          </div>
          <div className='flex flex-col leading-tight'>
            <div className='text-lg sm:text-xl flex items-center'>
              <span className='text-gray-800 dark:text-gray-100 mr-3 font-semibold'>
                {chatPartner.name}
              </span>
            </div>
            <div className='text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5'>
              {isTyping ? (
                <span className='text-indigo-600 dark:text-indigo-400 font-medium animate-pulse flex items-center gap-1'>
                  typing
                  <span className='inline-flex'>
                    <span className='animate-bounce'>.</span>
                    <span className='animate-bounce [animation-delay:0.2s]'>.</span>
                    <span className='animate-bounce [animation-delay:0.4s]'>.</span>
                  </span>
                </span>
              ) : isGroupChat ? (
                <span>{memberCount > 0 ? `${memberCount} members` : chatPartner.email}</span>
              ) : isPartnerOnline ? (
                <span className='text-emerald-600 dark:text-emerald-400 font-medium'>Online</span>
              ) : (
                <span>Offline</span>
              )}
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className='flex items-center gap-2'>
          {isGroupChat && group && (
            <button onClick={() => setIsGroupFeaturesOpen(true)} className='p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-300' title='Group activity' aria-label='Group activity'><Sparkles size={18} /></button>
          )}
          {/* Group member management */}
          {isGroupChat && group && (
            <button onClick={() => setIsMembersManagerOpen(true)} className='p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-300' title='Manage members' aria-label='Manage members'><Users size={18} /></button>
          )}
          {/* Group settings and member controls */}
          {isGroupChat && group && (
            <button onClick={() => setIsGroupSettingsOpen(true)} className='p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-300' title='Group settings' aria-label='Group settings'>
              <SettingsIcon size={18} />
            </button>
          )}
          {/* Add Friends to Group Button - hidden when the group's policy
              restricts invitations, so members never hit a dead-end 403 */}
          {isGroupChat && group && memberInvitesAllowed(group, sessionId) && (
            <button
              onClick={() => setIsAddMembersModalOpen(true)}
              className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-medium text-xs border border-indigo-200 dark:border-indigo-800 transition shadow-2xs'
              title='Add friends to this group'
            >
              <UserPlus size={14} />
              <span className='hidden sm:inline'>Add Friends</span>
            </button>
          )}

          {/* Search Toggle Button & Input */}
          {isSearchOpen ? (
            <div className='flex items-center gap-1.5 bg-gray-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full'>
              <Search size={15} className='text-gray-400' />
              <input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search in chat...'
                className='bg-transparent border-0 focus:ring-0 text-xs text-gray-800 dark:text-gray-100 placeholder:text-gray-400 p-0 w-32 sm:w-48'
                autoFocus
              />
              <button
                onClick={() => {
                  setIsSearchOpen(false)
                  setSearchQuery('')
                }}
                className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchOpen(true)}
              className='p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-colors'
              title='Search in conversation'
            >
              <Search size={18} />
            </button>
          )}
        </div>
      </div>

      {isGroupChat && <PinnedMessagesBanner groupId={groupId} onJumpTo={jumpToPinnedMessage} />}

      <Messages
        initialMessages={initialMessages}
        sessionId={sessionId}
        sessionImg={sessionImg}
        chatPartner={chatPartner}
        chatId={chatId}
        isPartnerTyping={isTyping}
        highlightQuery={searchQuery}
        messages={messages}
        setMessages={setMessages}
        onRetryMessage={handleRetryMessage}
        onReplyToMessage={(msg) => {
          if (msg.senderId !== 'system') setReplyingTo(msg)
        }}
      />
      <ChatInput
        chatPartner={chatPartner.name}
        chatId={chatId}
        onSendMessage={handleSendMessage}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      {isGroupChat && group && (
        <GroupSettingsModal
          isOpen={isGroupSettingsOpen}
          onClose={() => setIsGroupSettingsOpen(false)}
          group={group}
          sessionId={sessionId}
          onGroupUpdated={(updated) => { setGroup(updated); setExistingMemberIds(updated.memberIds); setMemberCount(updated.memberIds.length) }}
          onLeave={() => router.push('/dashboard/chats')}
        />
      )}

      {isGroupChat && group && (
        <GroupMembersManager
          isOpen={isMembersManagerOpen}
          onClose={() => setIsMembersManagerOpen(false)}
          group={group}
          sessionId={sessionId}
          onGroupUpdated={(updated) => {
            setGroup(updated)
            setExistingMemberIds(updated.memberIds)
            setMemberCount(updated.memberIds.length)
          }}
        />
      )}

      {isGroupChat && group && (
        <GroupFeaturesPanel
          isOpen={isGroupFeaturesOpen}
          onClose={() => setIsGroupFeaturesOpen(false)}
          groupId={groupId}
          isAdmin={resolveAdminIds(group).includes(sessionId)}
        />
      )}

      {/* Add Members to Group Modal */}
      {isGroupChat && (
        <AddGroupMembersModal
          isOpen={isAddMembersModalOpen}
          onClose={() => setIsAddMembersModalOpen(false)}
          groupId={groupId}
          groupName={chatPartner.name}
          existingMemberIds={existingMemberIds}
          onMembersAdded={(newMemberIds, updatedGroup) => {
            if (updatedGroup?.memberIds) {
              setGroup(updatedGroup)
              setExistingMemberIds(updatedGroup.memberIds)
              setMemberCount(updatedGroup.memberIds.length)
            } else {
              setExistingMemberIds((prev) => [...prev, ...newMemberIds])
              setMemberCount((prev) => prev + newMemberIds.length)
            }
          }}
        />
      )}
    </div>
  )
}

export default Chat
