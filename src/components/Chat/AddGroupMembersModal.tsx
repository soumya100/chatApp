"use client"

import { FC, useEffect, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { Fragment } from "react"
import { Avatar, Button } from "@/common"
import { Check, Loader2, Search, UserPlus, Users, X } from "lucide-react"
import toast from "react-hot-toast"
import axios from "axios"

interface AddGroupMembersModalProps {
  isOpen: boolean
  onClose: () => void
  groupId: string
  groupName: string
  existingMemberIds: string[]
  onMembersAdded?: (newMemberIds: string[], updatedGroup?: Group) => void
}

const AddGroupMembersModal: FC<AddGroupMembersModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  existingMemberIds,
  onMembersAdded,
}) => {
  const [friends, setFriends] = useState<User[]>([])
  const [isLoadingFriends, setIsLoadingFriends] = useState(false)
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch friends list on modal open
  useEffect(() => {
    if (isOpen) {
      setIsLoadingFriends(true)
      setSelectedFriendIds([])
      setSearchQuery("")
      axios
        .get<User[]>("/api/friends/list")
        .then((res) => {
          if (Array.isArray(res.data)) {
            setFriends(res.data)
          }
        })
        .catch((err) => {
          console.error("Failed to load friends:", err)
        })
        .finally(() => {
          setIsLoadingFriends(false)
        })
    }
  }, [isOpen])

  // Filter friends not currently in the group
  const existingSet = new Set(existingMemberIds)
  const availableFriends = friends.filter((f) => !existingSet.has(f.id))

  const filteredFriends = availableFriends.filter((f) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    const nameMatch = f.name?.toLowerCase().includes(q)
    const emailMatch = f.email?.toLowerCase().includes(q)
    return nameMatch || emailMatch
  })

  const toggleSelectFriend = (id: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleAddMembers = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedFriendIds.length === 0 || isSubmitting) return

    setIsSubmitting(true)
    try {
      const res = await axios.post<{ success: boolean; group: Group; addedCount: number }>(
        "/api/group/members/add",
        {
          groupId,
          memberIds: selectedFriendIds,
        }
      )

      if (res.data.success) {
        toast.success(
          `Added ${selectedFriendIds.length} friend${
            selectedFriendIds.length > 1 ? "s" : ""
          } to ${groupName}!`
        )
        onMembersAdded?.(selectedFriendIds, res.data.group)
        onClose()
      }
    } catch (err: any) {
      console.error("Add members error:", err)
      toast.error(err?.response?.data?.message || "Failed to add members to group")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md p-6 text-gray-900 dark:text-gray-100">
                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={18} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <UserPlus size={22} />
                  </div>
                  <div>
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6">
                      Add to {groupName}
                    </Dialog.Title>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Select friends to add to this group chat
                    </p>
                  </div>
                </div>

                {/* Friend Search Bar */}
                {availableFriends.length > 0 && (
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search friends..."
                      className="w-full text-xs rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/80 py-2 pl-8 pr-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                )}

                {/* Friends List */}
                <div className="mt-2 max-h-60 overflow-y-auto space-y-1 pr-1">
                  {isLoadingFriends ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <Loader2 size={24} className="animate-spin text-indigo-600 mb-2" />
                      <p className="text-xs">Loading your friends...</p>
                    </div>
                  ) : availableFriends.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                      <Users size={36} className="text-gray-300 dark:text-zinc-600 mb-2" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        No friends available to add
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        All your friends are already in this group, or you haven&apos;t added any friends yet.
                      </p>
                    </div>
                  ) : filteredFriends.length === 0 ? (
                    <p className="text-xs text-center py-6 text-gray-400">
                      No friends matching &quot;{searchQuery}&quot;
                    </p>
                  ) : (
                    filteredFriends.map((friend) => {
                      const isSelected = selectedFriendIds.includes(friend.id)
                      return (
                        <div
                          key={friend.id}
                          onClick={() => toggleSelectFriend(friend.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all select-none ${
                            isSelected
                              ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700"
                              : "border-transparent hover:bg-gray-50 dark:hover:bg-zinc-800/60"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar
                              src={friend.image}
                              name={friend.name}
                              sizeClassName="w-8 h-8"
                              textClassName="text-xs font-bold text-white"
                            />
                            <div className="min-w-0 truncate">
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                {friend.name}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate">{friend.email}</p>
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors shrink-0 ml-2 ${
                              isSelected
                                ? "bg-indigo-600 text-white"
                                : "border border-gray-300 dark:border-zinc-600"
                            }`}
                          >
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="mt-5 flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
                  >
                    Cancel
                  </button>
                  <Button
                    onClick={handleAddMembers}
                    disabled={selectedFriendIds.length === 0 || isSubmitting}
                    isLoading={isSubmitting}
                    className="px-4 py-2 text-xs"
                  >
                    Add {selectedFriendIds.length > 0 ? `(${selectedFriendIds.length})` : ""}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

export default AddGroupMembersModal

