// Single source of truth for group admin resolution.
//
// Every API route and UI surface that authorizes a group action derives the
// admin roster through this helper, so the fallback rule can never drift
// between call sites: a group without an explicit adminIds roster is
// administered by its creator. If this rule ever changes, it changes in
// exactly one place.
export function resolveAdminIds(group: { adminIds?: string[] | null; creatorId: string }): string[] {
    return group.adminIds?.length ? group.adminIds : [group.creatorId]
}

// The add-members gates the POST /api/group/members/add route enforces for
// non-admin callers. Shared with the UI so the entry point can be hidden
// (not merely rejected with a 403) when the group's policy forbids member
// invites.
export function memberInvitesAllowed(
    group: { adminIds?: string[] | null; creatorId: string; settings?: GroupSettings | null },
    userId: string
): boolean {
    const isAdmin = resolveAdminIds(group).includes(userId)
    if (isAdmin) return true
    const settings = (group.settings ?? {}) as GroupSettings
    if (settings.approvalRequired) return false
    if (settings.onlyAdminsCanAddMembers) return false
    if (settings.allowMemberInvites === false) return false
    return true
}
