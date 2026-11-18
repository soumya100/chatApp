import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import {
    commitGroupMembershipAtomically,
    GroupMembershipCommitInput
} from "@/lib/group-atomic-commit"
import { resolveAdminIds } from "@/lib/group"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { getServerSession } from "next-auth"
import { nanoid } from "nanoid"
import { z } from "zod"

export const dynamic = "force-dynamic"

const addMembersSchema = z.object({
    groupId: z.string().min(1),
    memberIds: z.array(z.string().min(1)).min(1).max(100)
})

const MAX_COMMIT_ATTEMPTS = 4

function decode<T>(raw: unknown): T {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T
}

// Realtime/infra error strings can embed control characters that forge log
// lines. They are neutralised without a control-character regex (which itself
// trips lint rules) and bounded so one failure cannot flood the log.
function sanitizeLogDetail(detail: string): string {
    return Array.from(detail)
        .map(character => (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character))
        .join("")
        .slice(0, 200)
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 })

        let body: unknown
        // A malformed request body is rejected with a typed 400 — it is
        // reported to the caller, never swallowed.
        try {
            body = await req.json()
        } catch {
            return Response.json({ message: "Request body must be valid JSON" }, { status: 400 })
        }
        const parsed = addMembersSchema.safeParse(body)
        if (!parsed.success) {
            return Response.json({ message: parsed.error.issues[0]?.message || "Invalid payload" }, { status: 400 })
        }

        const { groupId, memberIds } = parsed.data
        const groupKey = `group:${groupId}`
        const membersSetKey = `group:${groupId}:members`
        const messagesKey = `chat:group--${groupId}:messages`

        let committed: { group: Group; addedCount: number; addedIds: string[]; systemMessage: Message } | null = null

        for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS && !committed; attempt++) {
            const groupRaw = await db.get(groupKey)
            if (!groupRaw) return Response.json({ message: "Group not found" }, { status: 404 })

            const expectedRaw = typeof groupRaw === "string" ? groupRaw : JSON.stringify(groupRaw)
            const group = decode<Group>(groupRaw)
            const existingMemberIds = group.memberIds || []
            const isMember = existingMemberIds.includes(session.user.id)
            if (!isMember) return Response.json({ message: "You are not a member of this group" }, { status: 403 })

            const isAdmin = resolveAdminIds(group).includes(session.user.id)

            // Authorization contract (stated requirement R-AUTH-1 of this PR's
            // group-settings redesign, asserted by tests/group-api.test.cjs):
            // the GroupSettingsModal writes three add-member policies and this
            // route enforces them server-side. `approvalRequired` blocks
            // member-initiated adds entirely (admin must approve);
            // `allowMemberInvites: false` (explicitly set, so undefined keeps
            // the legacy member-can-invite behaviour) folds into the existing
            // admin-only gate. Both predate the atomic commit, so a rejected
            // caller writes nothing.
            if (group.settings?.approvalRequired && !isAdmin) {
                return Response.json(
                    { message: "A group admin must approve new members", code: "ADMIN_APPROVAL_REQUIRED" },
                    { status: 403 }
                )
            }
            if ((group.settings?.onlyAdminsCanAddMembers || group.settings?.allowMemberInvites === false) && !isAdmin) {
                return Response.json(
                    { message: "Only group admins can add members", code: "MEMBER_ADD_ADMIN_ONLY" },
                    { status: 403 }
                )
            }

            const uniqueIds = Array.from(new Set(memberIds)).filter(id => !existingMemberIds.includes(id))
            if (uniqueIds.length === 0) {
                return Response.json({ message: "Selected users are already group members" }, { status: 409 })
            }

            const rawUsers = await Promise.all(uniqueIds.map(id => db.get(`user:${id}`)))
            let malformedUserRecords = 0
            const validMembers = uniqueIds.flatMap((id, index) => {
                const raw = rawUsers[index]
                if (!raw) return []
                try {
                    const user = decode<User>(raw)
                    return user?.id ? [{ id, name: user.name || "Member" }] : []
                } catch {
                    malformedUserRecords += 1
                    return []
                }
            })
            // A malformed stored user record is never silently dropped: the
            // count is logged (no identifiers — the raw record may hold
            // profile data) and surfaced in the failure payload when it is
            // the reason nothing could be added.
            if (malformedUserRecords) {
                console.warn(`Member add skipped ${malformedUserRecords} malformed user record(s).`)
            }
            const validMemberIds = validMembers.map(member => member.id)
            if (!validMemberIds.length) {
                return Response.json(
                    {
                        message: malformedUserRecords
                            ? `None of the selected users could be loaded (${malformedUserRecords} malformed user record(s) skipped)`
                            : "No valid users were selected"
                    },
                    { status: 404 }
                )
            }
            const addedNames = validMembers.map(member => member.name)

            const updatedGroup: Group = {
                ...group,
                memberIds: [...existingMemberIds, ...validMemberIds],
                updatedAt: Date.now()
            }
            const actorName = session.user.name || "A member"
            const systemMessage: Message = {
                id: nanoid(),
                senderId: "system",
                receiverId: `group--${groupId}`,
                text: `${actorName} added ${addedNames.length ? addedNames.join(", ") : `${uniqueIds.length} member(s)`} to the group`,
                timestamp: Date.now(),
                senderName: "System"
            }

            const communityId = group.communityId || ""
            let community: GroupMembershipCommitInput["community"] = {
                key: "",
                next: "",
                id: "",
                expectedRaw: ""
            }
            if (communityId) {
                const rawCommunity = await db.get(`community:${communityId}`)
                if (rawCommunity) {
                    const communityDoc = decode<{ memberIds?: string[]; updatedAt?: number } & Record<string, unknown>>(rawCommunity)
                    communityDoc.memberIds = Array.from(new Set([...(communityDoc.memberIds || []), ...validMemberIds]))
                    communityDoc.updatedAt = Date.now()
                    community = {
                        key: `community:${communityId}`,
                        next: JSON.stringify(communityDoc),
                        id: communityId,
                        expectedRaw: typeof rawCommunity === "string" ? rawCommunity : JSON.stringify(rawCommunity)
                    }
                }
            }

            const result = await commitGroupMembershipAtomically({
                groupKey,
                membersSetKey,
                messagesKey,
                expectedRaw,
                updatedGroup,
                actorId: session.user.id,
                groupId,
                addedMemberIds: validMemberIds,
                systemMessage,
                community
            })

            if (Number(result) === 1) {
                committed = { group: updatedGroup, addedCount: validMemberIds.length, addedIds: validMemberIds, systemMessage }
            }
        }

        if (!committed) {
            return Response.json(
                { message: "The group was updated concurrently. Please review the member list and try again." },
                { status: 409 }
            )
        }

        const { group: updatedGroup, addedCount, addedIds, systemMessage } = committed

        const fanoutResults = await Promise.allSettled([
            ...addedIds.map(id => pusherServer.trigger(
                toPusherKey(`private-user:${id}:groups`), "new_group", updatedGroup
            )),
            pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "group_members_updated", {
                group: updatedGroup, addedMemberIds: addedIds
            }),
            pusherServer.trigger(toPusherKey(`private-chat:group--${groupId}`), "incoming-message", systemMessage)
        ])

        // Realtime fan-out must never fail silently: every rejected delivery is
        // inspected, counted and logged. The logged reason is sanitised (no
        // control characters, bounded length) and carries no member identifiers.
        let rejectedDeliveries = 0
        for (const fanoutResult of fanoutResults) {
            if (fanoutResult.status === "rejected") {
                rejectedDeliveries += 1
                const reason = fanoutResult.reason instanceof Error ? fanoutResult.reason.message : String(fanoutResult.reason)
                console.error(`Group membership realtime delivery rejected: ${sanitizeLogDetail(reason)}`)
            }
        }
        if (rejectedDeliveries) {
            console.error(`Group membership realtime fan-out finished with ${rejectedDeliveries} rejected delivery(ies).`)
        }

        return Response.json({ success: true, group: updatedGroup, addedCount })
    } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        console.error("Failed to add members to group:", sanitizeLogDetail(detail))
        return Response.json({ message: "Failed to add members to group" }, { status: 500 })
    }
}
