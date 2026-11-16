"use client"

import { FC, FormEvent, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Dialog } from "@headlessui/react"
import { CalendarDays, Check, Loader2, Megaphone, Plus, X } from "lucide-react"

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
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try { const res = await axios.get(`/api/group/${groupId}/features`); setFeatures(res.data.features) }
    catch { toast.error("Unable to load group features") }
    finally { setLoading(false) }
  }
  useEffect(() => { if (isOpen) load() }, [isOpen, groupId])

  const act = async (payload: any) => {
    if (busy) return
    setBusy(true)
    try { await axios.post(`/api/group/${groupId}/features`, payload); await load(); toast.success("Group updated") }
    catch (error: any) { toast.error(error?.response?.data?.message || "Action failed") }
    finally { setBusy(false) }
  }

  const createPoll = async (e: FormEvent) => { e.preventDefault(); await act({ action: "createPoll", question, options: options.map(x => x.trim()).filter(Boolean), multiple }); setQuestion(""); setOptions(["", ""]) }
  const createEvent = async (e: FormEvent) => { e.preventDefault(); if (!eventDate) return; await act({ action: "createEvent", title: eventTitle, description: eventDescription, startsAt: new Date(eventDate).getTime() }); setEventTitle(""); setEventDescription(""); setEventDate("") }

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <div className="fixed inset-0 overflow-y-auto p-4"><div className="flex min-h-full items-center justify-center">
        <Dialog.Panel className="w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-5 text-gray-900 dark:text-gray-100 shadow-2xl">
          <div className="flex items-center justify-between mb-4"><div><Dialog.Title className="font-semibold text-lg">Group activity</Dialog.Title><p className="text-xs text-gray-500">Polls, events and announcements</p></div><button onClick={onClose} aria-label="Close"><X size={18}/></button></div>
          {loading ? <div className="py-12 flex justify-center"><Loader2 className="animate-spin"/></div> : <div className="max-h-[70vh] overflow-y-auto space-y-5 pr-1">
            <section className="rounded-xl border border-gray-200 dark:border-zinc-800 p-4">
              <h3 className="font-semibold text-sm mb-3">Create a poll</h3>
              <form onSubmit={createPoll} className="space-y-2">
                <input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask a question" maxLength={240} className="w-full rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-2 text-sm"/>
                {options.map((option,i)=><input key={i} value={option} onChange={e=>setOptions(prev=>prev.map((v,j)=>j===i?e.target.value:v))} placeholder={`Option ${i+1}`} maxLength={100} className="w-full rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-2 text-sm"/>)}
                <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={()=>setOptions(prev=>prev.length<10?[...prev,""]:prev)} className="text-xs text-indigo-600">+ Add option</button><label className="text-xs flex gap-2 items-center"><input type="checkbox" checked={multiple} onChange={e=>setMultiple(e.target.checked)}/> Allow multiple answers</label><button disabled={busy || !question.trim() || options.filter(x=>x.trim()).length<2} className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Create poll</button></div>
              </form>
            </section>
            <section className="rounded-xl border border-gray-200 dark:border-zinc-800 p-4">
              <h3 className="font-semibold text-sm mb-3 flex gap-2 items-center"><CalendarDays size={16}/> Create an event</h3>
              <form onSubmit={createEvent} className="space-y-2">
                <input value={eventTitle} onChange={e=>setEventTitle(e.target.value)} placeholder="Event title" maxLength={120} className="w-full rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-2 text-sm"/>
                <input type="datetime-local" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="w-full rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-2 text-sm"/>
                <textarea value={eventDescription} onChange={e=>setEventDescription(e.target.value)} placeholder="Details (optional)" rows={2} className="w-full rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-2 text-sm"/>
                <button disabled={busy || !eventTitle.trim() || !eventDate} className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Create event</button>
              </form>
            </section>
            {isAdmin && <section className="rounded-xl border border-gray-200 dark:border-zinc-800 p-4"><h3 className="font-semibold text-sm mb-2 flex gap-2 items-center"><Megaphone size={16}/> Post announcement</h3><textarea value={announcement} onChange={e=>setAnnouncement(e.target.value)} rows={2} maxLength={2000} placeholder="Write an announcement..." className="w-full rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-2 text-sm"/><button disabled={busy || !announcement.trim()} onClick={async()=>{await act({action:"announce",text:announcement});setAnnouncement("")}} className="mt-2 rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Publish</button></section>}
            <section><h3 className="font-semibold text-sm mb-2">Polls</h3>{features.polls.length===0?<p className="text-xs text-gray-500">No polls yet.</p>:features.polls.map(poll=><div key={poll.id} className="rounded-xl border border-gray-200 dark:border-zinc-800 p-3 mb-2"><p className="text-sm font-medium mb-2">{poll.question}</p><div className="space-y-1">{poll.options.map((option:any)=><button key={option.id} disabled={busy || poll.closed} onClick={()=>act({action:"votePoll",pollId:poll.id,optionIds:[option.id]})} className="w-full flex items-center justify-between rounded-lg bg-gray-50 dark:bg-zinc-800 px-3 py-2 text-xs text-left"><span>{option.label}</span><span className="text-gray-500">{option.votes?.length||0} <Check size={12} className="inline"/></span></button>)}</div></div>)}</section>
            <section><h3 className="font-semibold text-sm mb-2">Events</h3>{features.events.length===0?<p className="text-xs text-gray-500">No upcoming events.</p>:features.events.map(event=><div key={event.id} className="rounded-xl border border-gray-200 dark:border-zinc-800 p-3 mb-2"><p className="text-sm font-medium">{event.title}</p><p className="text-xs text-gray-500">{new Date(event.startsAt).toLocaleString()}</p>{event.description&&<p className="text-xs mt-1">{event.description}</p>}<div className="flex gap-2 mt-2">{(["going","maybe","not-going"] as const).map(response=><button key={response} onClick={()=>act({action:"respondEvent",eventId:event.id,response})} className="rounded-lg border border-gray-200 dark:border-zinc-700 px-2 py-1 text-[11px] capitalize">{response.replace("-"," ")}</button>)}</div></div>)}</section>
            <section><h3 className="font-semibold text-sm mb-2">Announcements</h3>{features.announcements.length===0?<p className="text-xs text-gray-500">No announcements yet.</p>:features.announcements.map(item=><div key={item.id} className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 mb-2"><p className="text-sm">{item.text}</p><p className="text-[10px] text-gray-500 mt-1">{new Date(item.createdAt).toLocaleString()}</p></div>)}</section>
          </div>}
        </Dialog.Panel>
      </div></div>
    </Dialog>
  )
}
export default GroupFeaturesPanel
