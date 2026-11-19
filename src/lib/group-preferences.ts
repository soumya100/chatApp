// Canonical accessor for the per-user, per-group preference namespace
// (`user:<userId>:group-preferences:<groupId>`).
//
// This module is the single owner of the namespace key format and of the
// stored-record contract. Features that consult or mutate these preferences —
// GET/PUT /api/user/group-preferences (the owning feature), the group member
// directory, and message send/read/history — all go through here, so a key
// format or normalization change can never drift between call sites.

export interface GroupPreferences {
    notifications: "all" | "muted"
    showReadReceipts: boolean
    hideProfilePhoto: boolean
}

export const GROUP_PREFERENCES_DEFAULTS: GroupPreferences = {
    notifications: "all",
    showReadReceipts: true,
    hideProfilePhoto: false,
}

export function groupPreferencesKey(userId: string, groupId: string): string {
    return `user:${userId}:group-preferences:${groupId}`
}

export type StoredGroupPreferences =
    | { status: "missing"; preferences: GroupPreferences }
    | { status: "ok"; preferences: GroupPreferences }
    | { status: "corrupt" }

function normalize(value: Record<string, unknown>): GroupPreferences {
    return {
        notifications: value.notifications === "muted" ? "muted" : "all",
        showReadReceipts: value.showReadReceipts !== false,
        hideProfilePhoto: value.hideProfilePhoto === true,
    }
}

// Convenience variant for consumers that fall back to defaults when a record
// is missing or corrupt (notification fan-out, read receipts, the owning
// feature's GET/PUT). Privacy-sensitive consumers must use
// parseStoredGroupPreferences and handle the "corrupt" status themselves.
export function groupPreferencesOrDefault(raw: unknown): GroupPreferences {
    const stored = parseStoredGroupPreferences(raw)
    return stored.status === "corrupt" ? { ...GROUP_PREFERENCES_DEFAULTS } : stored.preferences
}

// Decodes a stored preference record. `status` distinguishes the three cases
// callers must handle differently:
// - "missing": no record saved yet -> normalized defaults apply.
// - "ok": record decoded -> normalized preferences.
// - "corrupt": record exists but cannot be decoded. Callers decide the
//   fail-closed behavior per feature (privacy consumers hide photos; other
//   consumers fall back to defaults). They never trust a corrupt record.
export function parseStoredGroupPreferences(raw: unknown): StoredGroupPreferences {
    if (raw == null || raw === "") {
        return { status: "missing", preferences: { ...GROUP_PREFERENCES_DEFAULTS } }
    }
    let decoded: unknown = raw
    if (typeof raw === "string") {
        try {
            decoded = JSON.parse(raw)
        } catch {
            return { status: "corrupt" }
        }
    }
    if (decoded == null) {
        return { status: "missing", preferences: { ...GROUP_PREFERENCES_DEFAULTS } }
    }
    if (typeof decoded !== "object") {
        return { status: "corrupt" }
    }
    return { status: "ok", preferences: normalize(decoded as Record<string, unknown>) }
}
