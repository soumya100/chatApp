"use client"

import { getFirstWordInitial } from "@/lib/avatars"
import { FC, useEffect, useState } from "react"

interface AvatarProps {
    src?: string | null
    name?: string | null
    className?: string
    sizeClassName?: string
    alt?: string
    textClassName?: string
}

const Avatar: FC<AvatarProps> = ({
    src,
    name,
    className = "",
    sizeClassName = "w-8 h-8",
    alt = "profile image",
    textClassName = "text-xs font-bold text-white",
}) => {
    const [hasError, setHasError] = useState(false)

    // Reset error state if src changes
    useEffect(() => {
        setHasError(false)
    }, [src])

    const initial = getFirstWordInitial(name)

    // Deterministic gradient selection based on name
    const getGradientByName = (str?: string | null) => {
        const gradients = [
            "from-indigo-600 to-violet-600",
            "from-blue-600 to-cyan-500",
            "from-emerald-600 to-teal-500",
            "from-rose-500 to-amber-500",
            "from-purple-600 to-pink-500",
            "from-amber-500 to-orange-600",
        ]
        if (!str) return gradients[0]
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash)
        }
        const index = Math.abs(hash) % gradients.length
        return gradients[index]
    }

    const gradient = getGradientByName(name)

    if (src && !hasError) {
        return (
            <div className={`relative overflow-hidden rounded-full shrink-0 select-none ${sizeClassName} ${className}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={src}
                    alt={alt}
                    onError={() => setHasError(true)}
                    className="h-full w-full object-cover rounded-full"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                />
            </div>
        )
    }

    // Default Fallback: Username's first word initial
    return (
        <div
            className={`flex items-center justify-center rounded-full shrink-0 select-none bg-gradient-to-tr ${gradient} shadow-sm ${sizeClassName} ${className}`}
            title={name || "User Avatar"}
            role="img"
            aria-label={name ? `${name}'s avatar` : alt}
        >
            <span className={textClassName} aria-hidden="true">
                {initial}
            </span>
        </div>
    )
}

export default Avatar

