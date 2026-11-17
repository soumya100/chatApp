"use client"

import { FC, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Dialog } from "@headlessui/react"
import { Crown, Shield, ShieldOff, UserMinus, X, Loader2 } from "lucide-react"

interface Props { isOpen: boolean; onClose: () => void; group: Group; sessionId: string; onGroupUpdated: (group: Group) => void }
const GroupMembersManager: FC<Props> = ({ isOpen, onClose, group, sessionId, onGroupUpdated }) => {
  const [busyId, setBusyId] = useState<string | null>(null)
  const isCreator = group.creatorId === sessionId
  const isAdmin = (group.adminIds || [group.creatorId]).includes(sessionId)
  const act = async (action: "promote" | "demote" | "remove", memberId: string) => {
    if (busyId) return
    setBusyId(memberId)
    try {
      const response = await axios.post(`/api/group/${group.id}/manage`, { action, memberId })
      onGroupUpdated(response.data.group)
      toast.success(action === "remove" ? "Member removed" : action === "promote" ? "Member promoted" : "Admin role removed")
    } catch (error: any) { toast.error(error?.response?.data?.message || "Unable to update member") }
    finally { setBusyId(null) }
  }
  return <Dialog open={isOpen} onClose={onClose} className="relative z-50">
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
    <div className="fixed inset-0 overflow-y-auto p-4"><div className="flex min-h-full items-center justify-center">
      <Dialog.Panel className="w-full max-w-xl rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-gray-900 dark:text-gray-100 shadow-2xl">
        <div className="flex justify-between items-center mb-4"><div><Dialog.Title className="font-semibold text-lg">Group members</Dialog.Title><p className="text-xs text-gray-500">{group.memberIds.length} members · {group.adminIds?.length || 1} admins</p></div><button onClick={onClose} aria-label="Close"><X size={18}/></button></div>
        <div className="max-h-[65vh] overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800">
          {group.memberIds.map(id => { const admin = (group.adminIds || [group.creatorId]).includes(id); return <div key={id} className="flex items-center gap-3 py-3">
            <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-semibold">{id.slice(0,2).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{id === sessionId ? "You" : id}</p><p className="text-xs text-gray-500">{id === group.creatorId ? "Creator" : admin ? "Admin" : "Member"}</p></div>
            {id === group.creatorId && <Crown size={16} className="text-amber-500"/>}
            {isAdmin && id !== sessionId && id !== group.creatorId && <div className="flex gap-1">
              {isCreator && (admin ? <button disabled={!!busyId} onClick={() => act("demote",id)} title="Demote admin" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"><ShieldOff size={15}/></button> : <button disabled={!!busyId} onClick={() => act("promote",id)} title="Promote to admin" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"><Shield size={15}/></button>)}
              <button disabled={!!busyId} onClick={() => act("remove",id)} title="Remove member" className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">{busyId === id ? <Loader2 size={15} className="animate-spin"/> : <UserMinus size={15}/>}</button>
            </div>}
          </div> })}
        </div>
        {!isAdmin && <p className="text-xs text-gray-500 mt-3">Only group admins can manage members. Only the creator can change admin roles.</p>}
      </Dialog.Panel>
    </div></div>
  </Dialog>
}
export default GroupMembersManager
