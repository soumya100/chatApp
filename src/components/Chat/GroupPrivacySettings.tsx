"use client"

import { FC, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Bell, Check, Eye, EyeOff, Loader2 } from "lucide-react"

interface Preferences {
  notifications: "all" | "muted"
  showReadReceipts: boolean
  hideProfilePhoto: boolean
}
interface Props { groupId: string }

const initialPreferences: Preferences = {
  notifications: "all",
  showReadReceipts: true,
  hideProfilePhoto: false,
}

const GroupPrivacySettings: FC<Props> = ({ groupId }) => {
  const [preferences, setPreferences] = useState<Preferences>(initialPreferences)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    axios.get(`/api/user/group-preferences?groupId=${encodeURIComponent(groupId)}`)
      .then(response => {
        if (active && response.data?.preferences) setPreferences({ ...initialPreferences, ...response.data.preferences })
      })
      .catch(() => { if (active) toast.error("Unable to load your group preferences") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [groupId])

  const save = async (patch: Partial<Preferences>) => {
    if (saving) return
    const previous = preferences
    const next = { ...previous, ...patch }
    setPreferences(next)
    setSaving(true)
    try {
      const response = await axios.put("/api/user/group-preferences", { groupId, ...patch })
      if (response.data?.preferences) setPreferences({ ...initialPreferences, ...response.data.preferences })
      toast.success("Preference updated")
    } catch (error: any) {
      setPreferences(previous)
      toast.error(error?.response?.data?.message || "Unable to save preference")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 p-5 text-xs text-slate-500 dark:border-white/10"><Loader2 size={15} className="animate-spin text-indigo-500"/> Loading your preferences…</div>

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <p className="text-sm font-semibold">Notifications & privacy</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Personal settings visible only to you.</p>
      </div>
      <div className="divide-y divide-slate-100 px-4 dark:divide-white/[0.06]">
        <label className="flex items-center justify-between gap-4 py-4">
          <span className="flex min-w-0 items-start gap-3">
            <Bell size={17} className="mt-0.5 shrink-0 text-indigo-500"/>
            <span><span className="block text-sm font-medium">Notifications</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Choose which group alerts you receive.</span></span>
          </span>
          <select disabled={saving} value={preferences.notifications} onChange={e => save({ notifications: e.target.value as Preferences["notifications"] })} className="max-w-[132px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-indigo-400 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900">
            <option value="all">All messages</option><option value="muted">Muted</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
          <span className="flex min-w-0 items-start gap-3">
            <Eye size={17} className="mt-0.5 shrink-0 text-indigo-500"/>
            <span><span className="block text-sm font-medium">Read receipts</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Let members know when you have read messages.</span></span>
          </span>
          <input type="checkbox" disabled={saving} checked={preferences.showReadReceipts} onChange={e => save({ showReadReceipts: e.target.checked })} className="h-5 w-5 shrink-0 accent-indigo-600 disabled:opacity-50"/>
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
          <span className="flex min-w-0 items-start gap-3">
            <EyeOff size={17} className="mt-0.5 shrink-0 text-indigo-500"/>
            <span><span className="block text-sm font-medium">Hide profile photo</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Hide your profile photo from people in this group.</span></span>
          </span>
          <input type="checkbox" disabled={saving} checked={preferences.hideProfilePhoto} onChange={e => save({ hideProfilePhoto: e.target.checked })} className="h-5 w-5 shrink-0 accent-indigo-600 disabled:opacity-50"/>
        </label>
      </div>
      <div className="flex items-center justify-end gap-1.5 px-4 pb-3 text-[10px] text-slate-400">
        {saving ? <><Loader2 size={11} className="animate-spin"/> Saving preference…</> : <><Check size={11}/> Changes save automatically</>}
      </div>
    </section>
  )
}

export default GroupPrivacySettings
