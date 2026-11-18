"use client"

import { FC, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Dialog } from "@headlessui/react"
import {
  Bell, Check, Clock3, Info, Loader2, LogOut, Settings2, ShieldCheck, SlidersHorizontal, Users, X
} from "lucide-react"
import GroupPrivacySettings from "./GroupPrivacySettings"

interface Props {
  isOpen: boolean
  onClose: () => void
  group: Group
  sessionId: string
  onGroupUpdated: (group: Group) => void
  onLeave: () => void
}

type SettingsTab = "general" | "permissions" | "privacy"

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
  { key: "onlyAdminsCanEditInfo", label: "Edit group information", help: "Limit the group name, photo and description to admins." },
  { key: "onlyAdminsCanAddMembers", label: "Add members", help: "Only admins can invite people to this group." },
  { key: "onlyAdminsCanSendMessages", label: "Send messages", help: "Keep conversations read-only for members." },
  { key: "approvalRequired", label: "Approve new members", help: "Require an admin to approve new members." },
  { key: "onlyAdminsCanPinMessages", label: "Pin messages", help: "Only admins can pin or unpin messages." },
  { key: "onlyAdminsCanCreatePolls", label: "Create polls", help: "Members can still participate in existing polls." },
  { key: "onlyAdminsCanCreateEvents", label: "Create events", help: "Restrict event creation to group admins." },
  { key: "announcementsOnly", label: "Announcements-only mode", help: "Turn this group into an admin-led announcement space." },
  { key: "allowMemberInvites", label: "Member invitations", help: "Allow members to invite friends when admin-only adding is disabled." },
]

const tabs: { id: SettingsTab; label: string; icon: typeof Info }[] = [
  { id: "general", label: "General", icon: Info },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "privacy", label: "Your privacy", icon: Bell },
]

const GroupSettingsModal: FC<Props> = ({ isOpen, onClose, group, sessionId, onGroupUpdated, onLeave }) => {
  const isAdmin = (group.adminIds || [group.creatorId]).includes(sessionId)
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || "")
  const [settings, setSettings] = useState<GroupSettings>({ ...defaults, ...group.settings })
  const [isSaving, setIsSaving] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setActiveTab("general")
    setName(group.name)
    setDescription(group.description || "")
    setSettings({ ...defaults, ...group.settings })
  }, [group, isOpen])

  const save = async () => {
    if (!isAdmin || isSaving || name.trim().length < 2) return
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
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-md transition-opacity" aria-hidden="true" />
      <div className="fixed inset-0 z-10 flex items-center justify-center p-0 sm:p-5">
        <Dialog.Panel className="flex max-h-[100dvh] w-full flex-col overflow-hidden bg-white text-slate-900 shadow-2xl dark:bg-[#111827] dark:text-slate-100 sm:max-h-[min(88vh,820px)] sm:max-w-3xl sm:rounded-3xl sm:border sm:border-slate-200 dark:sm:border-white/10">
          <header className="relative shrink-0 border-b border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-white px-5 pb-5 pt-5 dark:border-white/10 dark:from-indigo-950/50 dark:via-[#111827] dark:to-[#111827] sm:px-7 sm:pt-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
                  <Settings2 size={22} />
                </div>
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-xl font-semibold tracking-tight sm:text-2xl">Group settings</Dialog.Title>
                  <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Users size={13} /> {group.memberIds.length} members
                    <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                    {isAdmin ? "Administrator access" : "Member access"}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close settings" className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white">
                <X size={19} />
              </button>
            </div>
            <nav className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100/80 p-1 dark:bg-white/[0.06]" aria-label="Group settings sections">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${activeTab === id ? "bg-white text-indigo-700 shadow-sm dark:bg-white/10 dark:text-indigo-300" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}>
                  <Icon size={15} /> <span>{label}</span>
                </button>
              ))}
            </nav>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {activeTab === "general" && (
              <div className="mx-auto max-w-2xl space-y-5">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Info size={16} className="text-indigo-500" /> Group information</div>
                  {isAdmin ? (
                    <div className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-white/10 sm:p-5">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Group name</span>
                        <input value={name} onChange={e => setName(e.target.value)} maxLength={50} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]" placeholder="Give your group a name" />
                        <span className="mt-1 block text-right text-[11px] text-slate-400">{name.length}/50</span>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Description</span>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={4} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07] dark:focus:ring-indigo-500/15" placeholder="What is this group about?" />
                        <span className="mt-1 block text-right text-[11px] text-slate-400">{description.length}/500</span>
                      </label>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="font-semibold">{group.name}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500 dark:text-slate-400">{group.description || "No group description has been added."}</p>
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} className="text-indigo-500" /> Disappearing messages</div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose how long messages remain available in this group.</p>
                  <select disabled={!isAdmin} value={settings.disappearingMessagesSeconds || 0} onChange={e => setSettings(prev => ({ ...prev, disappearingMessagesSeconds: Number(e.target.value) }))} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-[#111827]">
                    <option value={0}>Off</option><option value={86400}>24 hours</option><option value={604800}>7 days</option><option value={7776000}>90 days</option>
                  </select>
                  {!isAdmin && <p className="mt-2 text-[11px] text-slate-500">Only admins can change this setting.</p>}
                </div>
              </div>
            )}

            {activeTab === "permissions" && (
              <div className="mx-auto max-w-2xl">
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal size={16} className="text-indigo-500" /> Group permissions</div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Control what members can do in this space.</p>
                </div>
                {!isAdmin && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">You can view these permissions, but only group admins can change them.</div>}
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4 dark:divide-white/[0.06] dark:border-white/10 sm:px-5">
                  {controls.map(control => (
                    <label key={control.key} className={`flex items-center justify-between gap-4 py-4 ${isAdmin ? "cursor-pointer" : "cursor-default"}`}>
                      <span className="min-w-0 pr-2">
                        <span className="block text-sm font-medium">{control.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{control.help}</span>
                      </span>
                      <input type="checkbox" disabled={!isAdmin} checked={Boolean(settings[control.key])} onChange={e => setSettings(prev => ({ ...prev, [control.key]: e.target.checked }))} className="h-5 w-5 shrink-0 cursor-pointer rounded accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-60" />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "privacy" && (
              <div className="mx-auto max-w-2xl">
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} className="text-indigo-500" /> Your preferences</div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">These settings apply to your account in this group only.</p>
                </div>
                <GroupPrivacySettings groupId={group.id} />
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 dark:border-white/10 dark:bg-[#111827] sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <button type="button" onClick={leave} disabled={isLeaving} className="inline-flex items-center justify-center gap-2 self-start rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-400/10">
              {isLeaving ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />} Leave group
            </button>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.06]">Close</button>
              {isAdmin && activeTab !== "privacy" && (
                <button type="button" onClick={save} disabled={isSaving || name.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save changes
                </button>
              )}
            </div>
          </footer>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}

export default GroupSettingsModal
