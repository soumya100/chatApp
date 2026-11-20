"use client"

import { FC, FormEvent, useCallback, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Dialog } from "@headlessui/react"
import { CalendarDays, Check, Loader2, Megaphone, X } from "lucide-react"

interface Props { isOpen: boolean; onClose: () => void; groupId: string; isAdmin: boolean }
type FeatureData = { polls: any[]; events: any[]; announcements: any[] }

const GroupFeaturesPanel: FC<Props> = ({ isOpen, onClose, groupId, isAdmin }) => {
  const [features, setFeatures] = useState<FeatureData>({ polls: [], events: [], announcements: [] })
  const [loading, setLoading] = useState(false)
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState(["", ""])
  const [multiple, setMultiple] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const [eventTitle, setEventTitle] = useState("")
  const [eventDescription, setEventDescription] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [eventTimeOptions, setEventTimeOptions] = useState(["", ""])
  const [eventSelections, setEventSelections] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [pollSelections, setPollSelections] = useState<Record<string, string[]>>({})

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try { const res = await axios.get(`/api/group/${groupId}/features`); setFeatures(res.data.features) }
    catch { toast.error("Unable to load group features") }
    finally { if (showLoading) setLoading(false) }
  }, [groupId])
  useEffect(() => { if (isOpen) void load() }, [isOpen, load])

  const act = async (payload: any): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try { await axios.post(`/api/group/${groupId}/features`, payload); await load(false); toast.success("Group updated"); return true }
    catch (error: any) { toast.error(error?.response?.data?.message || "Action failed"); return false }
    finally { setBusy(false) }
  }

  const createPoll = async (e: FormEvent) => {
    e.preventDefault()
    const saved = await act({ action: "createPoll", question, options: options.map(x => x.trim()).filter(Boolean), multiple })
    if (saved) { setQuestion(""); setOptions(["", ""]) }
  }
  const togglePollOption = (poll: any, optionId: string) => {
    if (!poll.multiple) {
      void act({ action: "votePoll", pollId: poll.id, optionIds: [optionId] })
      return
    }
    const selected = pollSelections[poll.id] ?? poll.myOptionIds ?? []
    setPollSelections(prev => ({
      ...prev,
      [poll.id]: selected.includes(optionId) ? selected.filter(id => id !== optionId) : [...selected, optionId]
    }))
  }
  const submitPollVote = async (poll: any) => {
    const optionIds = pollSelections[poll.id] ?? poll.myOptionIds ?? []
    if (!optionIds.length) return
    const saved = await act({ action: "votePoll", pollId: poll.id, optionIds })
    if (saved) setPollSelections(prev => ({ ...prev, [poll.id]: optionIds }))
  }
  const createEvent = async (e: FormEvent) => {
    e.preventDefault()
    if (!eventDate) return
    const selectedTimes = eventTimeOptions.map(value => value ? new Date(value).getTime() : 0).filter(Boolean)
    if (selectedTimes.length === 1) { toast.error("Add at least two time options, or clear both to create a fixed-time event."); return }
    const saved = await act({ action: "createEvent", title: eventTitle, description: eventDescription, startsAt: new Date(eventDate).getTime(), ...(selectedTimes.length >= 2 ? { timeOptions: selectedTimes } : {}) })
    if (saved) { setEventTitle(""); setEventDescription(""); setEventDate(""); setEventTimeOptions(["", ""]) }
  }

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-md" />
      <div className="fixed inset-0 overflow-y-auto p-4"><div className="flex min-h-full items-center justify-center">
        <Dialog.Panel className="flex max-h-[min(90vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white px-5 py-5 dark:border-white/10 dark:from-slate-800/60 dark:via-zinc-900 dark:to-zinc-900 sm:px-6"><div><Dialog.Title className="text-xl font-semibold tracking-tight">Group activity</Dialog.Title><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Bring everyone together with polls, events and announcements.</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"><X size={18}/></button></div>
          {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-indigo-500"/></div> : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <h3 className="font-semibold text-sm mb-3">Create a poll</h3>
              <form onSubmit={createPoll} className="space-y-2">
                <input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask a question" maxLength={240} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>
                {options.map((option,i)=><input key={i} value={option} onChange={e=>setOptions(prev=>prev.map((v,j)=>j===i?e.target.value:v))} placeholder={`Option ${i+1}`} maxLength={100} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>)}
                <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={()=>setOptions(prev=>prev.length<10?[...prev,""]:prev)} className="text-xs text-indigo-600">+ Add option</button><label className="text-xs flex gap-2 items-center cursor-pointer"><input type="checkbox" checked={multiple} onChange={e=>setMultiple(e.target.checked)}/> Allow multiple answers</label><button disabled={busy || !question.trim() || options.filter(x=>x.trim()).length<2} className="rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Create poll</button></div>
              </form>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <h3 className="font-semibold text-sm mb-3 flex gap-2 items-center"><CalendarDays size={16}/> Create an event</h3>
              <form onSubmit={createEvent} className="space-y-2">
                <input value={eventTitle} onChange={e=>setEventTitle(e.target.value)} placeholder="Event title" maxLength={120} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>
                <input type="datetime-local" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>
                <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-400/20 dark:bg-indigo-400/[0.06]"><p className="mb-2 text-xs font-semibold">Let the group choose a time</p><p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">Add at least two alternatives to enable voting.</p>{eventTimeOptions.map((value,index)=><input key={index} type="datetime-local" value={value} onChange={e=>setEventTimeOptions(prev=>prev.map((item,i)=>i===index?e.target.value:item))} className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.04]"/>)}<button type="button" onClick={()=>setEventTimeOptions(prev=>prev.length<6?[...prev,""]:prev)} disabled={eventTimeOptions.length>=6} className="text-xs font-medium text-indigo-600 disabled:opacity-40">+ Add another time</button></div>
                <textarea value={eventDescription} onChange={e=>setEventDescription(e.target.value)} placeholder="Details (optional)" rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>
                <button disabled={busy || !eventTitle.trim() || !eventDate} className="rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Create event</button>
              </form>
            </section>
            {isAdmin && <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"><h3 className="font-semibold text-sm mb-2 flex gap-2 items-center"><Megaphone size={16}/> Post announcement</h3><textarea value={announcement} onChange={e=>setAnnouncement(e.target.value)} rows={2} maxLength={2000} placeholder="Write an announcement..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/><button disabled={busy || !announcement.trim()} onClick={async()=>{const saved=await act({action:"announce",text:announcement});if(saved)setAnnouncement("")}} className="mt-2 rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Publish</button></section>}
            <section><h3 className="font-semibold text-sm mb-2">Polls</h3>{features.polls.length===0?<p className="text-xs text-slate-500 dark:text-slate-400">No polls yet.</p>:features.polls.map(poll=>{const selected=pollSelections[poll.id]??poll.myOptionIds??[];return <div key={poll.id} className="rounded-xl border border-slate-200 bg-white p-3 mb-2 dark:border-white/10 dark:bg-white/[0.03]"><p className="text-sm font-medium mb-2">{poll.question}</p><div className="space-y-1">{poll.options.map((option:any)=><button type="button" key={option.id} disabled={busy || poll.closed} onClick={()=>togglePollOption(poll,option.id)} className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs text-left border ${selected.includes(option.id)?"bg-indigo-50 border-indigo-300 dark:bg-indigo-400/10 dark:border-indigo-400/40":"bg-white dark:bg-white/[0.04] border-transparent"}`}><span>{option.label}</span><span className="text-slate-500 dark:text-slate-400">{option.votes?.length||0} <Check size={12} className="inline"/></span></button>)}</div>{poll.multiple&&<button type="button" disabled={busy||selected.length===0||poll.closed} onClick={()=>submitPollVote(poll)} className="mt-2 rounded-xl bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Submit selections</button>}</div>})}</section>
            <section><h3 className="font-semibold text-sm mb-2">Events</h3>{features.events.length===0?<p className="text-xs text-slate-500 dark:text-slate-400">No upcoming events.</p>:features.events.map(event=><div key={event.id} className="rounded-xl border border-slate-200 bg-white p-3 mb-2 dark:border-white/10 dark:bg-white/[0.03]"><p className="text-sm font-medium">{event.title}</p><p className="text-xs text-slate-500 dark:text-slate-400">{new Date(event.startsAt).toLocaleString()}</p>{event.description&&<p className="text-xs mt-1">{event.description}</p>}{event.timeOptions?.length>0&&<div className="mt-3 rounded-xl bg-indigo-50/70 p-3 dark:bg-indigo-400/[0.06]"><p className="mb-2 text-xs font-semibold">Vote for a time</p>{event.timeOptions.map((option:any)=><label key={option.id} className="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.04]"><span className="flex items-center gap-2"><input type="checkbox" checked={(eventSelections[event.id]??event.myOptionIds??[]).includes(option.id)} onChange={e=>setEventSelections(prev=>{const current=prev[event.id]??event.myOptionIds??[];return {...prev,[event.id]:e.target.checked?[...current,option.id]:current.filter(id=>id!==option.id)}})}/>{new Date(option.startsAt).toLocaleString()}</span><span className="text-slate-500">{option.votes?.length||0} votes</span></label>)}<button type="button" disabled={busy||!(eventSelections[event.id]??event.myOptionIds??[]).length} onClick={()=>act({action:"voteEvent",eventId:event.id,optionIds:eventSelections[event.id]??event.myOptionIds??[]})} className="mt-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Submit vote</button></div>}<div className="flex gap-2 mt-2">{(["going","maybe","not-going"] as const).map(response=><button type="button" key={response} disabled={busy} onClick={()=>act({action:"respondEvent",eventId:event.id,response})} className="rounded-lg border border-slate-200 dark:border-white/10 px-2 py-1 text-[11px] capitalize transition hover:bg-slate-100 dark:hover:bg-white/10">{response.replace("-"," ")}</button>)}</div></div>)}</section>
            <section><h3 className="font-semibold text-sm mb-2">Announcements</h3>{features.announcements.length===0?<p className="text-xs text-slate-500 dark:text-slate-400">No announcements yet.</p>:features.announcements.map(item=><div key={item.id} className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 mb-2"><p className="text-sm">{item.text}</p><p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{new Date(item.createdAt).toLocaleString()}</p></div>)}</section>
          </div>}
        </Dialog.Panel>
      </div></div>
    </Dialog>
  )
}
export default GroupFeaturesPanel
