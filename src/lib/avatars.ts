/**
 * Utilities and catalog for user avatars
 */

export interface PrebuiltAvatar {
    id: string
    name: string
    dataUrl: string
}

/**
 * Extracts the first word or initial from a user's name
 */
export function getFirstWordInitial(name?: string | null): string {
    if (!name || !name.trim()) return '?'
    const clean = name.trim()
    const firstWord = clean.split(/\s+/)[0] || clean
    return firstWord.charAt(0).toUpperCase()
}

/**
 * Generates an SVG Data URI with the user's first word initial on a gradient background
 */
export function generateInitialsAvatar(
    name: string,
    fromColor = '#6366f1',
    toColor = '#8b5cf6'
): string {
    const initial = getFirstWordInitial(name)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <linearGradient id="avatarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${fromColor}"/>
          <stop offset="100%" stop-color="${toColor}"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#avatarGradient)"/>
      <text x="50%" y="54%" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="56" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initial}</text>
    </svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Generates a colorful vector avatar SVG Data URI
 */
function createVectorAvatar(bgColor1: string, bgColor2: string, innerSvg: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bgColor1}"/>
          <stop offset="100%" stop-color="${bgColor2}"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#bgGrad)"/>
      ${innerSvg}
    </svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Curated list of high-definition prebuilt vector avatars (100% offline, zero network requests)
 */
export const PREBUILT_AVATARS: PrebuiltAvatar[] = [
    {
        id: 'cyber-bot',
        name: 'Cyber Bot',
        dataUrl: createVectorAvatar(
            '#4f46e5',
            '#06b6d4',
            `<g fill="#ffffff">
              <rect x="36" y="44" width="56" height="46" rx="14" fill="#ffffff" fill-opacity="0.95"/>
              <rect x="46" y="56" width="12" height="10" rx="3" fill="#0f172a"/>
              <rect x="70" y="56" width="12" height="10" rx="3" fill="#0f172a"/>
              <circle cx="52" cy="61" r="2" fill="#38bdf8"/>
              <circle cx="76" cy="61" r="2" fill="#38bdf8"/>
              <rect x="52" y="74" width="24" height="4" rx="2" fill="#0f172a"/>
              <rect x="62" y="32" width="4" height="12" fill="#ffffff"/>
              <circle cx="64" cy="30" r="4" fill="#38bdf8"/>
              <rect x="28" y="58" width="8" height="16" rx="4" fill="#ffffff"/>
              <rect x="92" y="58" width="8" height="16" rx="4" fill="#ffffff"/>
            </g>`
        ),
    },
    {
        id: 'cosmic-star',
        name: 'Cosmic Star',
        dataUrl: createVectorAvatar(
            '#8b5cf6',
            '#ec4899',
            `<path d="M64 26L74 50L98 52L80 69L85 93L64 80L43 93L48 69L30 52L54 50Z" fill="#fef08a" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>`
        ),
    },
    {
        id: 'neon-ninja',
        name: 'Neon Ninja',
        dataUrl: createVectorAvatar(
            '#0f172a',
            '#1e293b',
            `<g>
              <circle cx="64" cy="64" r="40" fill="#1e293b" stroke="#38bdf8" stroke-width="3"/>
              <rect x="38" y="52" width="52" height="20" rx="10" fill="#0284c7"/>
              <ellipse cx="52" cy="62" rx="4" ry="2" fill="#ffffff"/>
              <ellipse cx="76" cy="62" rx="4" ry="2" fill="#ffffff"/>
              <path d="M44 48C50 44 78 44 84 48" stroke="#f43f5e" stroke-width="4" stroke-linecap="round"/>
            </g>`
        ),
    },
    {
        id: 'emerald-spark',
        name: 'Emerald Shield',
        dataUrl: createVectorAvatar(
            '#059669',
            '#10b981',
            `<path d="M64 28L92 40V66C92 84 64 98 64 98C64 98 36 84 36 66V40L64 28Z" fill="#ffffff" fill-opacity="0.9"/>
             <path d="M64 36L84 46V64C84 76 64 88 64 88C64 88 44 76 44 64V46L64 36Z" fill="#059669"/>
             <path d="M56 62L62 68L74 54" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
        ),
    },
    {
        id: 'solar-flare',
        name: 'Solar Flame',
        dataUrl: createVectorAvatar(
            '#ea580c',
            '#f59e0b',
            `<path d="M64 24C64 24 76 42 76 56C76 64 72 70 66 74C72 74 76 68 76 68C76 78 68 86 64 90C60 86 52 78 52 68C52 68 56 74 62 74C56 70 52 64 52 56C52 42 64 24 64 24Z" fill="#fef08a"/>
             <path d="M64 48C64 48 70 58 70 66C70 70 68 74 64 78C60 74 58 70 58 66C58 58 64 48 64 48Z" fill="#ffffff"/>`
        ),
    },
    {
        id: 'crypto-gem',
        name: 'Crystal Gem',
        dataUrl: createVectorAvatar(
            '#2563eb',
            '#7c3aed',
            `<polygon points="64,28 94,54 64,100 34,54" fill="#67e8f9" stroke="#ffffff" stroke-width="2"/>
             <polygon points="64,28 64,100 94,54" fill="#38bdf8"/>
             <polygon points="64,28 64,100 34,54" fill="#bae6fd"/>`
        ),
    },
    {
        id: 'gradient-sunset',
        name: 'Sunset Glow',
        dataUrl: createVectorAvatar(
            '#f43f5e',
            '#fb923c',
            `<circle cx="64" cy="64" r="32" fill="#ffffff" fill-opacity="0.3"/>
             <circle cx="64" cy="64" r="20" fill="#ffffff" fill-opacity="0.6"/>
             <circle cx="64" cy="64" r="10" fill="#ffffff"/>`
        ),
    },
    {
        id: 'ocean-wave',
        name: 'Deep Ocean',
        dataUrl: createVectorAvatar(
            '#0284c7',
            '#0d9488',
            `<circle cx="64" cy="50" r="18" fill="#ffffff"/>
             <path d="M34 94C34 76 48 74 64 74C80 74 94 76 94 94" fill="#ffffff"/>`
        ),
    },
]

