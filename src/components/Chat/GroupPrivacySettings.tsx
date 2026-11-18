"use client"

import { FC, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"

interface Preferences { notifications: "all" | "muted"; showReadReceipts: boolean; hideProfilePhoto: boolean }
interface Props { groupId: string }
const GroupPrivacySettings: FC<Props> = ({ groupId }) => {
  const [preferences, setPreferences] = useState<Preferences>({ notifications: "all", showReadReceipts: true, hideProfilePhoto: false })
  const [loading, setLoading] = useState(true)
  useEffect(() => { let active = true; axios.get(`/api/user/group-preferences?groupId=${encodeURIComponent(groupId)}`).then(r => { if (active) setPreferences(r.data.preferences) }).catch(() => toast.error("Unable to load privacy preferences")).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [groupId])
  const save = async (patch: Partial<Preferences>) => { const next = { ...preferences, ...patch }; setPreferences(next); try { const r = await axios.put("/api/user/group-preferences", { groupId, ...patch }); setPreferences(r.data.preferences) } catch { setPreferences(preferences); toast.error("Unable to save preference") } }
  if (loading) return <p className="text-xs text-gray-500">Loading your preferences…</p>
  return <section className="mt-4 border-t border-gray-200 dark:border-zinc-800 pt-4 space-y-3">
    <h3 className="text-sm font-semibold">Your notifications & privacy</h3>
    <label className="block text-xs text-gray-500">Notifications<select value={preferences.notifications} onChange={e => save({ notifications: e.target.value as Preferences["notifications"] })} className="mt-1 block w-full rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-2 text-sm text-gray-900 dark:text-white"><option value="all">All messages</option><option value="muted">Muted</option></select></label>
    {([{key:"showReadReceipts",label:"Share read receipts"},{key:"hideProfilePhoto",label:"Hide my profile photo in this group"}] as const).map(item => <label key={item.key} className="flex items-center justify-between gap-3 text-sm"><span>{item.label}</span><input type="checkbox" checked={preferences[item.key]} onChange={e => save({ [item.key]: e.target.checked })} className="accent-indigo-600"/></label>)}
  </section>
}
export default GroupPrivacySettings
