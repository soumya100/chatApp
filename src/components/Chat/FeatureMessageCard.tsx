"use client"

import { FC, useCallback, useEffect, useState } from "react"
import axios from "axios"
import { CalendarDays, Check, Clock3, Loader2, Megaphone, Vote } from "lucide-react"

type Props = { groupId: string; featureType: "poll" | "event" | "announcement"; featureId: string }
type FeatureState = { polls: any[]; events: any[]; announcements: any[] }

const FeatureMessageCard: FC<Props> = ({ groupId, featureType, featureId }) => {
  const [features, setFeatures] = useState<FeatureState | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    try {
      const response = await axios.get(`/api/group/${groupId}/features`)
      setFeatures(response.data.features)
      setError("")
    } catch {
      setError("Activity details are temporarily unavailable.")
    }
  }, [groupId])
  useEffect(() => { void load() }, [load, featureId])

  const item = featureType === "poll"
    ? features?.polls.find(value => value.id === featureId)
    : featureType === "event"
      ? features?.events.find(value => value.id === featureId)
      : features?.announcements.find(value => value.id === featureId)

  const act = async (payload: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await axios.post(`/api/group/${groupId}/features`, payload)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message || "Unable to update this activity.")
    } finally { setBusy(false) }
  }

  if (featureType === "announcement") {
    return <div className="mt-2 min-w-[min(18rem,70vw)] rounded-xl border border-amber-300/70 bg-amber-50/95 p-3 text-amber-950 shadow-sm dark:border-amber-300/20 dark:bg-amber-950/35 dark:text-amber-100">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider"><Megaphone size={14}/> Group announcement</div>
      <p className="whitespace-pre-wrap break-words text-sm">{item?.text || "This announcement is no longer available."}</p>
      {item?.createdAt && <p className="mt-2 text-[10px] opacity-70">{new Date(item.createdAt).toLocaleString()}</p>}
    </div>
  }

  if (!features) return <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs opacity-75"><Loader2 size={13} className="animate-spin"/> Loading activity…</div>
  if (!item) return <p className="mt-2 rounded-lg bg-black/10 px-3 py-2 text-xs opacity-70">{error || "This activity is no longer available."}</p>

  if (featureType === "poll") {
    const poll = item
    const myVotes: string[] = selected.length ? selected : poll.myOptionIds || []
    const total = poll.options.reduce((sum: number, option: any) => sum + (option.votes?.length || 0), 0)
    return <div className="mt-2 w-[min(20rem,72vw)] rounded-xl border border-indigo-200/40 bg-slate-950/10 p-3 shadow-sm dark:border-indigo-300/15 dark:bg-slate-950/25">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider opacity-80"><Vote size={14}/> Group poll</div>
      <p className="mb-3 text-sm font-semibold">{poll.question}</p>
      <div className="space-y-2">{poll.options.map((option: any) => {
        const count = option.votes?.length || 0
        const percent = total ? Math.round(count / total * 100) : 0
        const chosen = myVotes.includes(option.id)
        return <button type="button" key={option.id} disabled={busy || poll.closed} onClick={() => {
          if (poll.multiple) setSelected(current => current.includes(option.id) ? current.filter(id => id !== option.id) : [...current, option.id])
          else void act({ action: "votePoll", pollId: poll.id, optionIds: [option.id] })
        }} className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-xs transition ${chosen ? "border-indigo-300 bg-indigo-500/15" : "border-white/15 bg-white/5 hover:bg-white/10"}`}>
          <span className="absolute inset-y-0 left-0 bg-indigo-400/15" style={{ width: `${percent}%` }}/>
          <span className="relative flex items-center justify-between gap-2"><span>{option.label}</span><span className="shrink-0 opacity-70">{count} · {percent}%</span></span>
        </button>
      })}</div>
      {poll.multiple && <button type="button" disabled={busy || !selected.length} onClick={() => void act({ action: "votePoll", pollId: poll.id, optionIds: selected })} className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Submit vote"}</button>}
      <p className="mt-2 text-[10px] opacity-65">{total} votes{poll.closed ? " · Closed" : " · Tap an option to vote"}</p>
      {error && <p className="mt-1 text-[10px] text-rose-300">{error}</p>}
    </div>
  }

  const event = item
  const response = event.myResponse
  return <div className="mt-2 w-[min(20rem,72vw)] rounded-xl border border-sky-200/40 bg-slate-950/10 p-3 shadow-sm dark:border-sky-300/15 dark:bg-slate-950/25">
    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider opacity-80"><CalendarDays size={14}/> Group event</div>
    <p className="text-sm font-semibold">{event.title}</p>
    <p className="mt-1 flex items-center gap-1.5 text-xs opacity-75"><Clock3 size={12}/>{new Date(event.startsAt).toLocaleString()}</p>
    {event.description && <p className="mt-2 whitespace-pre-wrap text-xs opacity-80">{event.description}</p>}
    {event.timeOptions?.length > 0 && <div className="mt-3 space-y-1.5">
      <p className="text-[11px] font-semibold opacity-80">Vote for a time</p>
      {event.timeOptions.map((option: any) => {
        const chosen = (selected.length ? selected : event.myOptionIds || []).includes(option.id)
        return <label key={option.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-2 text-xs">
          <span className="flex items-center gap-2"><input type="checkbox" checked={chosen} disabled={busy} onChange={e => setSelected(current => e.target.checked ? [...(current.length ? current : event.myOptionIds || []), option.id] : (current.length ? current : event.myOptionIds || []).filter(id => id !== option.id))}/>{new Date(option.startsAt).toLocaleString()}</span>
          <span className="opacity-65">{option.votes?.length || 0} votes</span>
        </label>
      })}
      <button type="button" disabled={busy || !(selected.length ? selected : event.myOptionIds || []).length} onClick={() => void act({ action: "voteEvent", eventId: event.id, optionIds: selected.length ? selected : event.myOptionIds || [] })} className="rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Submit time vote"}</button>
    </div>}
    <div className="mt-3 flex flex-wrap gap-1.5">{(["going", "maybe", "not-going"] as const).map(value => <button type="button" key={value} disabled={busy} onClick={() => void act({ action: "respondEvent", eventId: event.id, response: value })} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium capitalize transition ${response === value ? "border-sky-300 bg-sky-500/20" : "border-white/15 bg-white/5 hover:bg-white/10"}`}>{value.replace("-", " ")}</button>)}</div>
    <p className="mt-2 text-[10px] opacity-65">{event.responses?.going?.length || 0} going · {event.responses?.maybe?.length || 0} maybe</p>
    {error && <p className="mt-1 text-[10px] text-rose-300">{error}</p>}
  </div>
}

export default FeatureMessageCard
