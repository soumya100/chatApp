"use client"

import { FC, useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Dialog } from "@headlessui/react"
import Avatar from "@/common/Avatar"
import Button from "@/common/Button"
import { resolveAdminIds } from "@/lib/group"
import { Crown, Loader2, Search, Shield, ShieldOff, UserMinus, Users, X } from "lucide-react"

interface MemberProfile { id: string; name: string; image?: string }

interface MemberRowProps {
  member: MemberProfile
  sessionId: string
  creatorId: string
  adminIds: string[]
  canManage: boolean
  busyId: string | null
  onAct: (action: "promote" | "demote" | "remove", memberId: string) => void
}

// One roster row: badges, avatar and the admin-only role/membership actions.
// Extracted from the dialog body so each function holds one responsibility.
const MemberRow: FC<MemberRowProps> = ({ member, sessionId, creatorId, adminIds, canManage, busyId, onAct }) => {
  const admin = adminIds.includes(member.id)
  const creator = member.id === creatorId
  const isSelf = member.id === sessionId
  const viewerIsCreator = sessionId === creatorId
  return (
    <div className="flex items-center gap-3 py-3.5">
      <Avatar src={member.image || ""} name={member.name} sizeClassName="h-11 w-11" textClassName="text-sm font-semibold text-white"/>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{isSelf ? "You" : member.name}</p>
          {creator ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"><Crown size={11}/> Creator</span> : admin ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">Admin</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">Member</span>}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">{member.id}</p>
      </div>
      {canManage && !isSelf && !creator && (
        <div className="flex shrink-0 items-center gap-1">
          {viewerIsCreator && (admin
            ? <button type="button" disabled={!!busyId} onClick={() => onAct("demote", member.id)} title="Remove admin role" aria-label={`Remove admin role from ${member.name}`} className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10"><ShieldOff size={16}/></button>
            : <button type="button" disabled={!!busyId} onClick={() => onAct("promote", member.id)} title="Make admin" aria-label={`Promote ${member.name} to admin`} className="rounded-xl p-2.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-indigo-400/10"><Shield size={16}/></button>
          )}
          <button type="button" disabled={!!busyId} onClick={() => onAct("remove", member.id)} title="Remove member" aria-label={`Remove ${member.name}`} className="rounded-xl p-2.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-400/10">{busyId === member.id ? <Loader2 size={16} className="animate-spin"/> : <UserMinus size={16}/>}</button>
        </div>
      )}
    </div>
  )
}

interface Props {
  isOpen: boolean
  onClose: () => void
  group: Group
  sessionId: string
  onGroupUpdated: (group: Group) => void
}

const GroupMembersManager: FC<Props> = ({ isOpen, onClose, group, sessionId, onGroupUpdated }) => {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState("")
  const isCreator = group.creatorId === sessionId
  const adminIds = resolveAdminIds(group)
  const isAdmin = adminIds.includes(sessionId)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const response = await axios.get(`/api/group/${group.id}/members`)
      setMembers(response.data.members || [])
    } catch (error: any) {
      // Show an honest error state with a retry instead of fabricating
      // placeholder participants that were never returned by the API.
      setLoadError(true)
      setMembers([])
      toast.error(error?.response?.data?.message || "Unable to load group members")
    } finally {
      setLoading(false)
    }
  }, [group.id])

  useEffect(() => {
    if (isOpen) {
      setQuery("")
      void loadMembers()
    }
  }, [isOpen, loadMembers])

  const act = async (action: "promote" | "demote" | "remove", memberId: string) => {
    if (busyId) return
    if (action === "remove" && !window.confirm("Remove this person from the group? They will lose access to future messages.")) return
    setBusyId(memberId)
    try {
      const response = await axios.post(`/api/group/${group.id}/manage`, { action, memberId })
      onGroupUpdated(response.data.group)
      setMembers(prev => action === "remove" ? prev.filter(member => member.id !== memberId) : prev)
      toast.success(action === "remove" ? "Member removed" : action === "promote" ? "Member promoted to admin" : "Admin role removed")
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to update member")
    } finally {
      setBusyId(null)
    }
  }

  const visibleMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return [...members]
      .sort((a, b) => a.id === group.creatorId ? -1 : b.id === group.creatorId ? 1 : a.name.localeCompare(b.name))
      .filter(member => !normalized || member.name.toLowerCase().includes(normalized) || member.id.toLowerCase().includes(normalized))
  }, [members, query, group.creatorId])

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-md" aria-hidden="true" />
      <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto p-0 sm:p-5">
        <Dialog.Panel className="flex max-h-[100dvh] w-full flex-col overflow-hidden bg-white text-slate-900 shadow-2xl dark:bg-zinc-900 dark:text-slate-100 sm:max-h-[min(86vh,760px)] sm:max-w-xl sm:rounded-3xl sm:border sm:border-slate-200 dark:sm:border-white/10">
          <header className="shrink-0 border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white px-5 py-5 dark:border-white/10 dark:from-zinc-800/40 dark:via-zinc-900 dark:to-zinc-900 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"><Users size={20}/></div>
                <div>
                  <Dialog.Title className="text-xl font-semibold tracking-tight">People in this group</Dialog.Title>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{group.memberIds.length} members <span className="mx-1">·</span> {adminIds.length} admins</p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close members" className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"><X size={19}/></button>
            </div>
            <div className="relative mt-5">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a member..." className="w-full rounded-xl border border-slate-200 bg-white/90 py-3 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04]"/>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin text-indigo-500"/> Loading members…</div>
            ) : loadError ? (
              <div className="py-12 text-center"><Users size={28} className="mx-auto text-slate-300 dark:text-slate-600"/><p className="mt-3 text-sm font-medium">Couldn&apos;t load members</p><p className="mt-1 text-xs text-slate-500">Check your connection and try again.</p><Button type="button" size="sm" className="mt-4" onClick={() => void loadMembers()}>Retry</Button></div>
            ) : visibleMembers.length === 0 ? (
              <div className="py-12 text-center"><Users size={28} className="mx-auto text-slate-300 dark:text-slate-600"/><p className="mt-3 text-sm font-medium">No members found</p><p className="mt-1 text-xs text-slate-500">Try another name or search term.</p></div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {visibleMembers.map(member => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    sessionId={sessionId}
                    creatorId={group.creatorId}
                    adminIds={adminIds}
                    canManage={isAdmin}
                    busyId={busyId}
                    onAct={act}
                  />
                ))}
              </div>
            )}
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-white/10 sm:px-6">
            <p className="text-[11px] text-slate-500">{isCreator ? "You can manage roles and membership." : isAdmin ? "You can remove members." : "Only admins can manage membership."}</p>
            <Button type="button" variant="ghost" onClick={onClose}>Done</Button>
          </footer>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}

export default GroupMembersManager
