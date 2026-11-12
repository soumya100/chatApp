"use client"

import { FC, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { Fragment } from "react"
import { Avatar, Button } from "@/common"
import { Check, Loader2, Users, X } from "lucide-react"
import toast from "react-hot-toast"
import axios from "axios"
import { useRouter } from "next/navigation"

interface CreateGroupModalProps {
    isOpen: boolean
    onClose: () => void
    friends: User[]
    sessionId: string
    onGroupCreated?: (group: Group) => void
}

const CreateGroupModal: FC<CreateGroupModalProps> = ({
    isOpen,
    onClose,
    friends,
    sessionId,
    onGroupCreated
}) => {
    const router = useRouter()
    const [groupName, setGroupName] = useState("")
    const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)

    const toggleFriend = (friendId: string) => {
        setSelectedFriendIds((prev) =>
            prev.includes(friendId)
                ? prev.filter((id) => id !== friendId)
                : [...prev, friendId]
        )
    }

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = groupName.trim()
        if (!trimmed) {
            toast.error("Please enter a group name")
            return
        }

        setIsLoading(true)
        try {
            const res = await axios.post<{ success: boolean; group: Group }>("/api/group/create", {
                name: trimmed,
                memberIds: selectedFriendIds
            })

            if (res.data.success && res.data.group) {
                toast.success(`Group "${res.data.group.name}" created!`)
                onGroupCreated?.(res.data.group)
                onClose()
                setGroupName("")
                setSelectedFriendIds([])
                router.push(`/dashboard/chats/group--${res.data.group.id}`)
                router.refresh()
            }
        } catch (error: any) {
            console.error("Failed to create group:", error)
            toast.error(error?.response?.data?.message || "Failed to create group")
        } finally {
            setIsLoading(false)
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
                                <button
                                    onClick={onClose}
                                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
                                >
                                    <X className="w-5 h-5" />
                                </button>

                                <div className="flex items-center gap-3 mb-5">
                                    <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                                        <Users className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <Dialog.Title className="text-xl font-bold">
                                            Create New Group
                                        </Dialog.Title>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Chat with multiple friends at once
                                        </p>
                                    </div>
                                </div>

                                <form onSubmit={handleCreateGroup} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                            Group Name
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={groupName}
                                            onChange={(e) => setGroupName(e.target.value)}
                                            placeholder="e.g. Project Team, Weekend Trip"
                                            className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 dark:text-gray-100"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                Add Members ({selectedFriendIds.length} selected)
                                            </label>
                                        </div>

                                        {friends.length === 0 ? (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 py-3 text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl">
                                                You haven&apos;t added any friends yet. Add friends first to invite them to groups.
                                            </p>
                                        ) : (
                                            <div className="max-h-52 overflow-y-auto space-y-1.5 p-1 border border-gray-100 dark:border-zinc-800 rounded-xl">
                                                {friends.map((friend) => {
                                                    const isSelected = selectedFriendIds.includes(friend.id)
                                                    return (
                                                        <div
                                                            key={friend.id}
                                                            onClick={() => toggleFriend(friend.id)}
                                                            className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition ${
                                                                isSelected
                                                                    ? "bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800"
                                                                    : "hover:bg-gray-50 dark:hover:bg-zinc-800/60 border border-transparent"
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <Avatar
                                                                    src={friend.image}
                                                                    name={friend.name}
                                                                    sizeClassName="w-8 h-8"
                                                                />
                                                                <div className="truncate text-xs">
                                                                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                                        {friend.name}
                                                                    </p>
                                                                    <p className="text-gray-400 text-[11px] truncate">
                                                                        {friend.email}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div
                                                                className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                                                                    isSelected
                                                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                                                        : "border-gray-300 dark:border-zinc-600"
                                                                }`}
                                                            >
                                                                {isSelected && <Check className="w-3.5 h-3.5" />}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isLoading || !groupName.trim()}
                                            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    <span>Creating...</span>
                                                </>
                                            ) : (
                                                <span>Create Group</span>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    )
}

export default CreateGroupModal

