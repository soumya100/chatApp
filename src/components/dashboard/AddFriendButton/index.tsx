"use client"

import { Avatar, Button } from '@/common'
import axios from 'axios'
import {
  Check,
  Clock,
  Loader2,
  Search,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { FC, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface AddFriendProps {
  closeModalHandler(): void
}

interface SearchUserResult {
  id: string
  name: string
  email: string
  image: string
  isSelf: boolean
  isFriend: boolean
  isPending: boolean
  hasRequestedMe: boolean
}

const AddFriendButton: FC<AddFriendProps> = ({ closeModalHandler }) => {
  const [query, setQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([])
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const [sendingToId, setSendingToId] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  // Real-time debounced user search
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await axios.get<SearchUserResult[]>(
          `/api/users/search?q=${encodeURIComponent(trimmed)}`
        )
        setSearchResults(res.data || [])
      } catch (err) {
        console.error('Search users error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 250)

    return () => clearTimeout(timeout)
  }, [query])

  const sendFriendRequest = async (identifier: string, targetUserId?: string) => {
    setSendingToId(targetUserId || identifier)
    try {
      await axios.post('/api/friends/add', {
        email: identifier.trim().toLowerCase(),
      })
      toast.success('Friend request sent successfully!')
      if (targetUserId) {
        setSearchResults((prev) =>
          prev.map((u) => (u.id === targetUserId ? { ...u, isPending: true } : u))
        )
      } else {
        closeModalHandler()
      }
    } catch (err: any) {
      const msg = err?.response?.data || 'Failed to send request'
      toast.error(typeof msg === 'string' ? msg : 'Failed to send friend request')
    } finally {
      setSendingToId(null)
    }
  }

  const acceptRequest = async (senderId: string) => {
    setAcceptingId(senderId)
    try {
      await axios.post('/api/friends/accept', { id: senderId })
      toast.success('Friend request accepted!')
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === senderId ? { ...u, isFriend: true, hasRequestedMe: false } : u
        )
      )
    } catch (err) {
      toast.error('Failed to accept friend request')
    } finally {
      setAcceptingId(null)
    }
  }

  return (
    <div className='w-full text-gray-900 dark:text-gray-100'>
      <div className='mb-4'>
        <h2 className='font-bold text-xl'>Add a Friend</h2>
        <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
          Search registered users by name, username, or enter an email address
        </p>
      </div>

      {/* Interactive Search Bar */}
      <div className='relative mb-4'>
        <Search size={16} className='absolute left-3.5 top-3 text-gray-400' aria-hidden='true' />
        <input
          id='user-search-input'
          type='text'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Type a name or username (e.g. John, soumya)...'
          aria-label='Search users by name, username or email'
          className='w-full rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/80 py-2.5 pl-9 pr-9 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition'
          autoFocus
        />
        {query && (
          <button
            type='button'
            onClick={() => setQuery('')}
            className='absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            aria-label='Clear search query'
          >
            <X size={16} aria-hidden='true' />
          </button>
        )}
      </div>

      {/* Results View */}
      <div
        role='region'
        aria-live='polite'
        aria-label='User search results'
        className='min-h-[12rem] max-h-72 overflow-y-auto space-y-2 pr-1'
      >
        {isSearching ? (
          <div className='flex flex-col items-center justify-center py-10 text-gray-400'>
            <Loader2 size={24} className='animate-spin text-indigo-600 mb-2' />
            <p className='text-xs'>Searching registered users...</p>
          </div>
        ) : !query.trim() ? (
          <div className='flex flex-col items-center justify-center py-10 text-center text-gray-400 px-4'>
            <Users size={36} className='text-gray-300 dark:text-zinc-600 mb-2' />
            <p className='text-xs font-medium text-gray-600 dark:text-gray-400'>
              Search by name, username or email
            </p>
            <p className='text-[11px] text-gray-400 mt-1'>
              Type at least 1 character to discover registered users instantly
            </p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className='py-6 px-4 rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 text-center'>
            <p className='text-xs font-medium text-gray-700 dark:text-gray-300'>
              No users found matching &quot;{query}&quot;
            </p>
            <p className='text-[11px] text-gray-400 mt-1 mb-3'>
              If this is an exact email or username, send a request directly:
            </p>
            <Button
              onClick={() => sendFriendRequest(query)}
              disabled={sendingToId === query}
              isLoading={sendingToId === query}
              size='sm'
              className='text-xs px-4 h-8'
            >
              Send Request to &quot;{query}&quot;
            </Button>
          </div>
        ) : (
          searchResults.map((user) => (
            <div
              key={user.id}
              className='flex items-center justify-between p-2.5 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors'
            >
              <div className='flex items-center gap-3 min-w-0 mr-2'>
                <Avatar
                  src={user.image}
                  name={user.name}
                  sizeClassName='w-10 h-10'
                  textClassName='text-xs font-bold text-white'
                />
                <div className='min-w-0 truncate'>
                  <p className='text-sm font-semibold text-gray-900 dark:text-gray-100 truncate'>
                    {user.name}
                  </p>
                  <p className='text-xs text-gray-500 dark:text-gray-400 truncate'>
                    {user.email}
                  </p>
                </div>
              </div>

              <div className='shrink-0'>
                {user.isSelf ? (
                  <span className='text-xs font-medium text-gray-400 bg-gray-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full'>
                    You
                  </span>
                ) : user.isFriend ? (
                  <span className='inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-full'>
                    <UserCheck size={12} />
                    Friends
                  </span>
                ) : user.isPending ? (
                  <span className='inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full'>
                    <Clock size={12} />
                    Pending
                  </span>
                ) : user.hasRequestedMe ? (
                  <Button
                    onClick={() => acceptRequest(user.id)}
                    isLoading={acceptingId === user.id}
                    size='sm'
                    className='h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white'
                    aria-label={`Accept friend request from ${user.name}`}
                  >
                    Accept
                  </Button>
                ) : (
                  <Button
                    onClick={() => sendFriendRequest(user.email || user.name, user.id)}
                    isLoading={sendingToId === user.id}
                    size='sm'
                    className='h-8 px-3 text-xs flex items-center gap-1.5'
                    aria-label={`Send friend request to ${user.name}`}
                  >
                    <UserPlus size={13} aria-hidden='true' />
                    <span>Add</span>
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default AddFriendButton
