"use client"

import { FC, useRef, useState } from "react"
import { Dialog, Transition } from "@headlessui/react"
import { Fragment } from "react"
import { Avatar, Button } from "@/common"
import { PREBUILT_AVATARS, generateInitialsAvatar } from "@/lib/avatars"
import { Camera, Check, Image as ImageIcon, Loader2, Sparkles, Upload, User, X } from "lucide-react"
import toast from "react-hot-toast"
import axios from "axios"

interface AvatarModalProps {
    isOpen: boolean
    onClose: () => void
    currentImage: string
    userName: string
    userEmail: string
    onAvatarUpdated: (newImage: string) => void
}

type TabType = "prebuilt" | "upload" | "initials"

const AvatarModal: FC<AvatarModalProps> = ({
    isOpen,
    onClose,
    currentImage,
    userName,
    userEmail,
    onAvatarUpdated
}) => {
    const [selectedImage, setSelectedImage] = useState<string>(currentImage)
    const [activeTab, setActiveTab] = useState<TabType>("prebuilt")
    const [isSaving, setIsSaving] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Handle saving the new avatar
    async function handleSave() {
        if (!selectedImage) return
        setIsSaving(true)
        try {
            const res = await axios.post("/api/user/avatar", { image: selectedImage })
            if (res.data.success) {
                onAvatarUpdated(selectedImage)
                toast.success("Avatar updated successfully!")
                onClose()
            }
        } catch (error) {
            console.error("Failed to update avatar:", error)
            toast.error("Failed to update avatar. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

    // Handle file upload with client-side canvas compression
    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith("image/")) {
            toast.error("Please upload an image file (PNG, JPG, WEBP)")
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error("File size must be under 5MB")
            return
        }

        const reader = new FileReader()
        reader.onload = (event) => {
            const img = new window.Image()
            img.onload = () => {
                // Resize to max 256x256 for optimal Redis storage & fast socket delivery
                const canvas = document.createElement("canvas")
                const maxDim = 256
                let width = img.width
                let height = img.height

                if (width > height) {
                    if (width > maxDim) {
                        height = Math.round((height * maxDim) / width)
                        width = maxDim
                    }
                } else {
                    if (height > maxDim) {
                        width = Math.round((width * maxDim) / height)
                        height = maxDim
                    }
                }

                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext("2d")
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height)
                    const compressedDataUrl = canvas.toDataURL("image/webp", 0.85)
                    setSelectedImage(compressedDataUrl)
                    toast.success("Image selected! Click 'Save Changes' to apply.")
                }
            }
            img.src = event.target?.result as string
        }
        reader.readAsDataURL(file)
    }

    const gradientPresets = [
        { name: "Indigo Violet", from: "#6366f1", to: "#8b5cf6" },
        { name: "Ocean Blue", from: "#0ea5e9", to: "#3b82f6" },
        { name: "Emerald Mint", from: "#10b981", to: "#059669" },
        { name: "Sunset Coral", from: "#f43f5e", to: "#fb923c" },
        { name: "Neon Pink", from: "#ec4899", to: "#a855f7" },
        { name: "Amber Sun", from: "#f59e0b", to: "#d97706" }
    ]

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                {/* Backdrop */}
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
                            <Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg p-6 sm:p-7 text-gray-900 dark:text-gray-100">
                                {/* Close Button */}
                                <button
                                    onClick={onClose}
                                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
                                >
                                    <X className="w-5 h-5" />
                                </button>

                                {/* Header & Preview */}
                                <div className="flex items-center gap-4 pb-5 border-b border-gray-200 dark:border-zinc-800">
                                    <div className="relative group">
                                        <Avatar
                                            src={selectedImage}
                                            name={userName}
                                            sizeClassName="w-16 h-16"
                                            textClassName="text-2xl font-bold text-white"
                                            className="ring-4 ring-indigo-500/30 shadow-md"
                                        />
                                        <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white pointer-events-none">
                                            <Sparkles className="w-5 h-5 text-indigo-300" />
                                        </div>
                                    </div>
                                    <div>
                                        <Dialog.Title className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                            Customize Your Avatar
                                        </Dialog.Title>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            Choose a prebuilt avatar, upload a photo, or use your initial
                                        </p>
                                        <span className="inline-block mt-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                                            {userName} &bull; {userEmail}
                                        </span>
                                    </div>
                                </div>

                                {/* Tabs Navigation */}
                                <div className="flex gap-2 pt-4 pb-2 border-b border-gray-100 dark:border-zinc-800">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("prebuilt")}
                                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                            activeTab === "prebuilt"
                                                ? "bg-indigo-600 text-white shadow-sm"
                                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                                        }`}
                                    >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>Prebuilt Avatars</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("upload")}
                                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                            activeTab === "upload"
                                                ? "bg-indigo-600 text-white shadow-sm"
                                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                                        }`}
                                    >
                                        <Upload className="w-3.5 h-3.5" />
                                        <span>Upload Photo</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("initials")}
                                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                            activeTab === "initials"
                                                ? "bg-indigo-600 text-white shadow-sm"
                                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                                        }`}
                                    >
                                        <User className="w-3.5 h-3.5" />
                                        <span>Name Initial</span>
                                    </button>
                                </div>

                                {/* Tab 1: Prebuilt Avatars */}
                                {activeTab === "prebuilt" && (
                                    <div className="py-4 space-y-4">
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Select from HD vector avatars:
                                        </div>
                                        <div className="grid grid-cols-4 gap-3 max-h-56 overflow-y-auto p-1">
                                            {PREBUILT_AVATARS.map((avatar) => {
                                                const isSelected = selectedImage === avatar.dataUrl
                                                return (
                                                    <button
                                                        key={avatar.id}
                                                        type="button"
                                                        onClick={() => setSelectedImage(avatar.dataUrl)}
                                                        className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                                                            isSelected
                                                                ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500 scale-105"
                                                                : "border-gray-200 dark:border-zinc-800 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60"
                                                        }`}
                                                    >
                                                        <Avatar
                                                            src={avatar.dataUrl}
                                                            sizeClassName="w-12 h-12"
                                                            alt={avatar.name}
                                                        />
                                                        <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate w-full text-center">
                                                            {avatar.name}
                                                        </span>
                                                        {isSelected && (
                                                            <div className="absolute top-1 right-1 bg-indigo-600 rounded-full p-0.5 text-white shadow">
                                                                <Check className="w-2.5 h-2.5" />
                                                            </div>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Tab 2: Upload Photo */}
                                {activeTab === "upload" && (
                                    <div className="py-4 space-y-4">
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="border-2 border-dashed border-gray-300 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition bg-gray-50/50 dark:bg-zinc-800/40"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                                                <Camera className="w-6 h-6" />
                                            </div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                Click to upload your image
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                PNG, JPG, or WEBP (Max 5MB)
                                            </p>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                onChange={handleFileChange}
                                                accept="image/png, image/jpeg, image/webp"
                                                className="hidden"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Tab 3: Name Initials Avatars */}
                                {activeTab === "initials" && (
                                    <div className="py-4 space-y-4">
                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Choose a gradient color for your username&apos;s initial:
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {gradientPresets.map((preset) => {
                                                const initialAvatar = generateInitialsAvatar(
                                                    userName,
                                                    preset.from,
                                                    preset.to
                                                )
                                                const isSelected = selectedImage === initialAvatar
                                                return (
                                                    <button
                                                        key={preset.name}
                                                        type="button"
                                                        onClick={() => setSelectedImage(initialAvatar)}
                                                        className={`flex flex-col items-center gap-2 p-2.5 rounded-xl border transition ${
                                                            isSelected
                                                                ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500 scale-105"
                                                                : "border-gray-200 dark:border-zinc-800 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60"
                                                        }`}
                                                    >
                                                        <Avatar
                                                            src={initialAvatar}
                                                            sizeClassName="w-12 h-12"
                                                            textClassName="text-lg font-bold text-white"
                                                            alt={preset.name}
                                                        />
                                                        <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                                            {preset.name}
                                                        </span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Modal Footer */}
                                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-zinc-800">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        disabled={isSaving || selectedImage === currentImage}
                                        className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>Saving...</span>
                                            </>
                                        ) : (
                                            <span>Save Changes</span>
                                        )}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    )
}

export default AvatarModal

