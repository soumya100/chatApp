"use client"

import { FC, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Dialog, Transition } from "@headlessui/react"
import { Fragment } from "react"
import { Settings, X, Loader2, LogOut, ShieldCheck } from "lucide-react"

interface Props {
  isOpen: boolean
  onClose: () => void
  group: Group
  sessionId: string
  onGroupUpdated: (group: Group) => void
  onLeave: () => void
}

const defaults: GroupSettings = {
  onlyAdminsCanEditInfo: false,
  onlyAdminsCanAddMembers: false,
  onlyAdminsCanSendMessages: false,
  approvalRequired: false,
  disappearingMessagesSeconds: 0,
  onlyAdminsCanPinMessages: false,
  onlyAdminsCanCreatePolls: false,
  onlyAdminsCanCreateEvents: false,
  announcementsOnly: false,
  allowMemberInvites: true,
}

const controls: { key: keyof GroupSettings; label: string; help: string }[] = [
  { key: "onlyAdminsCanEditInfo", label: "Only admins can edit group info", help: "Restrict changes to the group name, image and description." },
  { key: "onlyAdminsCanAddMembers", label: "Only admins can add members", help: "Members cannot add friends to this group." },
  { key: "onlyAdminsCanSendMessages", label: "Only admins can send messages", help: "Use this group as an announcements channel." },
  { key: "approvalRequired", label: "Approve new members", help: "Require admin approval before a member is added." },
  { key: "onlyAdminsCanPinMessages", label: "Only admins can pin messages", help: "Restrict pinned-message management." },
  { key: "onlyAdminsCanCreatePolls", label: "Only admins can create polls", help: "Members can still vote on available polls." },
  { key: "onlyAdminsCanCreateEvents", label: "Only admins can create events", help: "Restrict event creation to group admins." },
  { key: "announcementsOnly", label: "Announcements-only mode", help: "Enable admin-only posting while keeping member access." },
  { key: "allowMemberInvites", label: "Allow member invitations", help: "Let members invite their friends when admin-only adding is disabled." },
]

const GroupSettingsModal: FC<Props> = ({ isOpen, onClose, group, sessionId, onGroupUpdated, onLeave }) => {
  const isAdmin = (group.adminIds || [group.creatorId]).includes(sessionId)
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || "")
  const [settings, setSettings] = useState<GroupSettings>({ ...defaults, ...group.settings })
  const [isSaving, setIsSaving] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    setName(group.name)
    setDescription(group.description || "")
    setSettings({ ...defaults, ...group.settings })
  }, [group, isOpen])

  const save = async () => {
    if (!isAdmin || isSaving) return
    setIsSaving(true)
    try {
      const response = await axios.post(`/api/group/${group.id}/manage`, {
        action: "update",
        name: name.trim(),
        description: description.trim(),
        settings,
      })
      onGroupUpdated(response.data.group)
      toast.success("Group settings saved")
      onClose()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to save group settings")
    } finally {
      setIsSaving(false)
    }
  }

  const leave = async () => {
    if (isLeaving) return
    setIsLeaving(true)
    try {
      await axios.post(`/api/group/${group.id}/manage`, { action: "leave" })
      toast.success("You left the group")
      onLeave()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to leave group")
    } finally {
      setIsLeaving(false)
    }
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Dialog.Panel className="w-full max-w-xl rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-gray-900 dark:text-gray-100 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-100 dark:bg-indigo-950 p-2 text-indigo-600"><Settings size={20} /></div>
                  <div><Dialog.Title className="font-semibold">Group settings</Dialog.Title><p className="text-xs text-gray-500">{group.memberIds.length} members</p></div>
                </div>
                <button onClick={onClose} aria-label="Close settings"><X size={18} /></button>
              </div>
              {isAdmin ? (
                <>
                  <label className="block text-xs font-medium mb-1">Group name</label>
                  <input value={name} onChange={e => setName(e.target.value)} maxLength={50} className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-3 py-2 text-sm mb-3" />
                  <label className="block text-xs font-medium mb-1">Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={2} className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-3 py-2 text-sm mb-4 resize-none" />
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2"><ShieldCheck size={14} /> Permissions and safety</div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800 border-y border-gray-100 dark:border-zinc-800">
                    {controls.map(control => (
                      <label key={control.key} className="flex items-center justify-between gap-4 py-3 cursor-pointer">
                        <span><span className="block text-sm font-medium">{control.label}</span><span className="block text-xs text-gray-500 mt-0.5">{control.help}</span></span>
                        <input type="checkbox" checked={Boolean(settings[control.key])} onChange={e => setSettings(prev => ({ ...prev, [control.key]: e.target.checked }))} className="h-4 w-4 accent-indigo-600 shrink-0" />
                      </label>
                    ))}
                  </div>
                  <label className="block text-xs font-medium mt-4 mb-1">Disappearing messages</label>
                  <select value={settings.disappearingMessagesSeconds || 0} onChange={e => setSettings(prev => ({ ...prev, disappearingMessagesSeconds: Number(e.target.value) }))} className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-3 py-2 text-sm">
                    <option value={0}>Off</option><option value={86400}>24 hours</option><option value={604800}>7 days</option><option value={7776000}>90 days</option>
                  </select>
                  <button onClick={save} disabled={isSaving || name.trim().length < 2} className="mt-5 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 text-sm font-semibold flex justify-center items-center gap-2">
                    {isSaving && <Loader2 size={15} className="animate-spin" />} Save changes
                  </button>
                </>
              ) : <p className="text-sm text-gray-500 py-6">Only group admins can edit group settings.</p>}
              <button onClick={leave} disabled={isLeaving} className="mt-3 w-full rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 py-2.5 text-sm font-semibold flex justify-center items-center gap-2">
                {isLeaving ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />} Leave group
              </button>
            </Dialog.Panel>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

export default GroupSettingsModal
