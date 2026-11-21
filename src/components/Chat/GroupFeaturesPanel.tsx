"use client"

import { FC, useCallback, useEffect, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import axios from "axios"
import toast from "react-hot-toast"
import { Dialog } from "@headlessui/react"
import { CalendarDays, Check, Loader2, Megaphone, X, Users, ChevronLeft, ChevronRight } from "lucide-react"
import { pusherClient } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import DateTimePicker from "@/components/Chat/DateTimePicker"

interface Props { isOpen: boolean; onClose: () => void; groupId: string; isAdmin: boolean }
const pollSchema = z.object({ question: z.string().trim().min(3, "Enter a question with at least 3 characters").max(240), options: z.array(z.object({ value: z.string().trim().min(1, "Enter an option").max(100) })).min(2, "Add at least two options").max(10), multiple: z.boolean() })
const eventBaseSchema = z.object({ title: z.string().trim().min(3, "Event title must be at least 3 characters").max(120), description: z.string().max(1000) })
const eventSchema = z.object({ title: z.string().trim().min(3, "Event title must be at least 3 characters").max(120), description: z.string().max(1000), startsAt: z.string().min(1, "Choose an event date and start time"), timeOptions: z.array(z.string()).max(6).refine(values => values.filter(Boolean).length !== 1, "Add at least two alternative times, or clear the alternatives to use a fixed time") })
type PollFormValues = z.infer<typeof pollSchema>
type FeatureData = { polls: any[]; events: any[]; announcements: any[] }

const GroupFeaturesPanel: FC<Props> = ({ isOpen, onClose, groupId, isAdmin }) => {
  const [features, setFeatures] = useState<FeatureData>({ polls: [], events: [], announcements: [] })
  const [loading, setLoading] = useState(false)
  const pollForm = useForm<PollFormValues>({ resolver: zodResolver(pollSchema), defaultValues: { question: "", options: [{ value: "" }, { value: "" }], multiple: false } })
  const pollFields = useFieldArray({ control: pollForm.control, name: "options" })
  const [announcement, setAnnouncement] = useState("")
  const eventForm = useForm<z.infer<typeof eventSchema>>({ resolver: zodResolver(eventSchema), defaultValues: { title: "", description: "", startsAt: "", timeOptions: ["", ""] }, mode: "onSubmit", reValidateMode: "onChange" })
  const eventTimeFields = useFieldArray({ control: eventForm.control, name: "timeOptions" })
  const eventDate = eventForm.watch("startsAt")
  const [eventSelections, setEventSelections] = useState<Record<string, string[]>>({})
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)
  const [pollSelections, setPollSelections] = useState<Record<string, string[]>>({})

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try { const res = await axios.get(`/api/group/${groupId}/features`); setFeatures(res.data.features) }
    catch { toast.error("Unable to load group features") }
    finally { if (showLoading) setLoading(false) }
  }, [groupId])
  useEffect(() => { if (!isOpen) return; void load(); const channel = pusherClient.subscribe(toPusherKey("private-chat:group--" + groupId)); const refresh = () => { void load(false) }; channel.bind("group_feature_updated", refresh); return () => { channel.unbind("group_feature_updated", refresh) } }, [isOpen, load, groupId])

  const act = async (payload: any): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try { await axios.post(`/api/group/${groupId}/features`, payload); await load(false); toast.success("Group updated"); return true }
    catch (error: any) { toast.error(error?.response?.data?.message || "Action failed"); return false }
    finally { setBusy(false) }
  }

  const createPoll = pollForm.handleSubmit(async values => {
    if (busy) return
    const cleanOptions = values.options.map(option => option.value.trim())
    const optimisticId = `optimistic-poll-${Date.now()}`
    const optimisticPoll = { id: optimisticId, question: values.question.trim(), multiple: values.multiple, closed: false, createdAt: Date.now(), options: cleanOptions.map((label, index) => ({ id: `${optimisticId}-${index}`, label, votes: [] })), myOptionIds: [] }
    setFeatures(current => ({ ...current, polls: [optimisticPoll, ...current.polls] }))
    const saved = await act({ action: "createPoll", question: values.question.trim(), options: cleanOptions, multiple: values.multiple })
    if (saved) pollForm.reset({ question: "", options: [{ value: "" }, { value: "" }], multiple: false })
    else setFeatures(current => ({ ...current, polls: current.polls.filter(item => item.id !== optimisticId) }))
  })
  const submitPollVote = async (poll: any, optionIds: string[]) => {
    if (busy || poll.closed || !optionIds.length) return
    const previous = features
    const selectedIds = new Set(optionIds)
    setFeatures(current => ({ ...current, polls: current.polls.map(item => item.id !== poll.id ? item : {
      ...item, myOptionIds: optionIds,
      options: item.options.map((option: any) => {
        const votes = [...(option.votes || [])]
        if ((poll.myOptionIds || []).includes(option.id)) votes.pop()
        if (selectedIds.has(option.id)) votes.push("__optimistic_current_user__")
        return { ...option, votes }
      })
    }) }))
    const saved = await act({ action: "votePoll", pollId: poll.id, optionIds })
    if (saved) { setPollSelections(current => ({ ...current, [poll.id]: optionIds })); await load(false) }
    else { setFeatures(previous); setPollSelections(current => ({ ...current, [poll.id]: poll.myOptionIds || [] })) }
  }
  const togglePollOption = (poll: any, optionId: string) => {
    const selected = pollSelections[poll.id] ?? poll.myOptionIds ?? []
    const next = selected.includes(optionId) ? selected.filter((id: string) => id !== optionId) : poll.multiple ? [...selected, optionId] : [optionId]
    setPollSelections(current => ({ ...current, [poll.id]: next }))
    if (!poll.multiple) void submitPollVote(poll, next)
  }
  const submitPollSelections = (poll: any) => void submitPollVote(poll, pollSelections[poll.id] ?? poll.myOptionIds ?? [])

  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
  const calendarStart = new Date(monthStart)
  calendarStart.setDate(1 - monthStart.getDay())
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart)
    day.setDate(calendarStart.getDate() + index)
    return day
  })
  const visibleEvents = selectedCalendarDay
    ? features.events.filter(event => {
        const dates = [event.startsAt, ...(event.timeOptions || []).map((option: any) => option.startsAt)].map(value => new Date(value))
        return dates.some(date => date.getFullYear() === selectedCalendarDay.getFullYear() && date.getMonth() === selectedCalendarDay.getMonth() && date.getDate() === selectedCalendarDay.getDate())
      })
    : features.events

  const submitEventVote = async (event: any) => {
    const optionIds = eventSelections[event.id] ?? event.myOptionIds ?? []
    if (busy || !optionIds.length) return
    const previous = features
    const selectedIds = new Set(optionIds)
    setFeatures(current => ({ ...current, events: current.events.map(item => item.id !== event.id ? item : {
      ...item, myOptionIds: optionIds,
      timeOptions: (item.timeOptions || []).map((option: any) => {
        const votes = [...(option.votes || [])]
        if ((event.myOptionIds || []).includes(option.id)) votes.pop()
        if (selectedIds.has(option.id)) votes.push("__optimistic_current_user__")
        return { ...option, votes }
      })
    }) }))
    try {
      setBusy(true)
      await axios.post("/api/group/" + groupId + "/features", { action: "voteEvent", eventId: event.id, optionIds })
      setEventSelections(current => ({ ...current, [event.id]: optionIds }))
      await load(false)
      toast.success("Your event vote was submitted")
    } catch (error: any) {
      setFeatures(previous)
      setEventSelections(current => ({ ...current, [event.id]: event.myOptionIds || [] }))
      toast.error(error?.response?.data?.message || "Unable to submit event vote")
    } finally { setBusy(false) }
  }
  const createEvent = eventForm.handleSubmit(async values => {
    if (busy) return
    const selectedTimes = values.timeOptions.map(value => value ? new Date(value).getTime() : 0).filter(Boolean)
    const startsAt = new Date(values.startsAt).getTime()
    if (!Number.isFinite(startsAt) || startsAt <= Date.now()) {
      eventForm.setError("startsAt", { type: "validate", message: "Choose a future event date and time" })
      return
    }
    const optimisticId = `optimistic-event-${Date.now()}`
    const optimisticEvent = { id: optimisticId, title: values.title.trim(), description: values.description, startsAt, createdAt: Date.now(), timeOptions: selectedTimes.map((time,index) => ({ id: `${optimisticId}-${index}`, startsAt: time, votes: [] })), responses: { going: [], maybe: [], "not-going": [] }, myOptionIds: [] }
    setFeatures(current => ({ ...current, events: [optimisticEvent, ...current.events] }))
    const saved = await act({ action: "createEvent", title: values.title.trim(), description: values.description, startsAt, ...(selectedTimes.length >= 2 ? { timeOptions: selectedTimes } : {}) })
    if (saved) eventForm.reset({ title: "", description: "", startsAt: "", timeOptions: ["", ""] })
    else setFeatures(current => ({ ...current, events: current.events.filter(item => item.id !== optimisticId) }))
  })

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-md" />
      <div className="fixed inset-0 overflow-y-auto p-4"><div className="flex min-h-full items-center justify-center">
        <Dialog.Panel className="flex max-h-[min(90vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white px-5 py-5 dark:border-white/10 dark:from-slate-800/60 dark:via-zinc-900 dark:to-zinc-900 sm:px-6"><div><Dialog.Title className="text-xl font-semibold tracking-tight">Group activity</Dialog.Title><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Bring everyone together with polls, events and announcements.</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"><X size={18}/></button></div>
          {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-indigo-500"/></div> : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <h3 className="font-semibold text-sm mb-3">Create a poll</h3>
              <form onSubmit={createPoll} noValidate className="space-y-2">
                <input {...pollForm.register("question")} placeholder="Ask a question" maxLength={240} aria-invalid={!!pollForm.formState.errors.question} aria-describedby={pollForm.formState.errors.question ? "poll-question-error" : undefined} className="w-full rounded-xl border border-slate-200 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:border-rose-500 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>
                {pollFields.fields.map((field,i)=>{const error=pollForm.formState.errors.options?.[i]?.value;return <div key={field.id}><input {...pollForm.register(`options.${i}.value`)} placeholder={`Option ${i+1}`} maxLength={100} aria-invalid={!!error} aria-describedby={error ? `poll-option-${i}-error` : undefined} className="w-full rounded-xl border border-slate-200 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:border-rose-500 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>{error&&<p id={`poll-option-${i}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{error.message}</p>}</div>})}
                <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={()=>{if(pollFields.fields.length<10)pollFields.append({value:""})}} className="text-xs text-indigo-600">+ Add option</button><label className="text-xs flex gap-2 items-center cursor-pointer"><input type="checkbox" {...pollForm.register("multiple")} className="h-4 w-4 rounded border-slate-300 accent-indigo-600 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/20"/> Allow multiple answers</label><button disabled={busy || pollForm.formState.isSubmitting} className="rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Create poll</button></div>
                {pollForm.formState.errors.question && <p id="poll-question-error" role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{pollForm.formState.errors.question.message}</p>}
                {(pollForm.formState.errors.options?.root?.message || pollForm.formState.errors.options?.message) && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{pollForm.formState.errors.options.root?.message || pollForm.formState.errors.options.message}</p>}
              </form>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <h3 className="font-semibold text-sm mb-3 flex gap-2 items-center"><CalendarDays size={16}/> Create an event</h3>
              <form onSubmit={createEvent} noValidate className="space-y-2">
                <div><input {...eventForm.register("title")} placeholder="Event title" maxLength={120} aria-invalid={!!eventForm.formState.errors.title} aria-describedby={eventForm.formState.errors.title ? "event-title-error" : undefined} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:border-rose-500 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>{eventForm.formState.errors.title && <p id="event-title-error" role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{eventForm.formState.errors.title.message}</p>}</div>
                <div className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-3 shadow-sm dark:border-indigo-300/15 dark:from-indigo-400/[0.08] dark:via-slate-950/30 dark:to-violet-400/[0.06]">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div><p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Choose event date</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Select a day, then set the start time</p></div>
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                      <button type="button" aria-label="Previous month" onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1))} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-indigo-50 dark:hover:bg-white/10"><ChevronLeft size={15}/></button>
                      <span className="min-w-24 text-center text-[11px] font-semibold text-slate-700 dark:text-slate-200">{calendarMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</span>
                      <button type="button" aria-label="Next month" onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1))} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-indigo-50 dark:hover:bg-white/10"><ChevronRight size={15}/></button>
                    </div>
                  </div>
                  <div className="mb-1 grid grid-cols-7 gap-1">{["S","M","T","W","T","F","S"].map((day,index)=><span key={day+index} className="py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-slate-400">{day}</span>)}</div>
                  <div className="grid grid-cols-7 gap-1">{calendarDays.map((day,index)=>{const inMonth=day.getMonth()===calendarMonth.getMonth();const selected=eventDate.slice(0,10)===`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;const past=new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime()<new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()).getTime();return <button type="button" key={index} disabled={past} onClick={()=>{const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;eventForm.setValue("startsAt", `${date}T${eventDate.slice(11,16)||"18:00"}`, { shouldDirty: true, shouldValidate: eventForm.formState.isSubmitted })}} className={`relative flex h-8 items-center justify-center rounded-lg text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-25 ${selected?"bg-indigo-600 text-white shadow-md shadow-indigo-600/20":inMonth?"text-slate-700 hover:bg-indigo-100 dark:text-slate-200 dark:hover:bg-white/10":"text-slate-300 dark:text-slate-600"}`}>{day.getDate()}</button>})}</div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-indigo-100 pt-3 dark:border-white/10">
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{eventDate?new Date(eventDate).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"}):"No date selected"}</p>
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">Start time <span className="flex items-center gap-1"><select aria-label="Event hour" value={eventDate.slice(11,13)||"18"} onChange={e=>{const date=eventDate.slice(0,10);if(date)eventForm.setValue("startsAt", `${date}T${e.target.value}:${eventDate.slice(14,16)||"00"}`, { shouldDirty: true, shouldValidate: eventForm.formState.isSubmitted })}} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs font-semibold text-indigo-600 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-indigo-300">{Array.from({length:24},(_,hour)=><option key={hour} value={String(hour).padStart(2,"0")}>{String(hour).padStart(2,"0")}</option>)}</select><span>:</span><select aria-label="Event minute" value={eventDate.slice(14,16)||"00"} onChange={e=>{const date=eventDate.slice(0,10);if(date)eventForm.setValue("startsAt", `${date}T${eventDate.slice(11,13)||"18"}:${e.target.value}`, { shouldDirty: true, shouldValidate: eventForm.formState.isSubmitted })}} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs font-semibold text-indigo-600 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-indigo-300">{[0,5,10,15,20,25,30,35,40,45,50,55].map(minute=><option key={minute} value={String(minute).padStart(2,"0")}>{String(minute).padStart(2,"0")}</option>)}</select></span></label>
                  </div>
                </div>
                <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-400/20 dark:bg-indigo-400/[0.06]"><p className="mb-2 text-xs font-semibold">Let the group choose a time</p><p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">Add at least two alternatives to enable voting.</p>{eventTimeFields.fields.map((field,index)=><div key={field.id} className="mb-2 flex items-center gap-2"><div className="min-w-0 flex-1"><DateTimePicker label={`Alternative time ${index+1}`} value={eventForm.watch(`timeOptions.${index}`) || ""} disabled={busy} onChange={next=>eventForm.setValue(`timeOptions.${index}`, next, { shouldDirty: true, shouldValidate: eventForm.formState.isSubmitted })}/></div>{eventTimeFields.fields.length>2&&<button type="button" aria-label={`Remove alternative ${index+1}`} onClick={()=>eventTimeFields.remove(index)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-400/10"><X size={14}/></button>}</div>)}{eventForm.formState.errors.timeOptions && <p role="alert" className="mb-2 text-xs font-medium text-rose-600 dark:text-rose-400">{eventForm.formState.errors.timeOptions.message || eventForm.formState.errors.timeOptions.root?.message}</p>}<button type="button" onClick={()=>{if(eventTimeFields.fields.length<6)eventTimeFields.append("")}} disabled={eventTimeFields.fields.length>=6} className="text-xs font-medium text-indigo-600 disabled:opacity-40">+ Add another time</button></div>
                <div><textarea {...eventForm.register("description")} placeholder="Details (optional)" rows={2} maxLength={1000} aria-invalid={!!eventForm.formState.errors.description} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:border-rose-500 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/>{eventForm.formState.errors.description && <p role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{eventForm.formState.errors.description.message}</p>}</div>
                <button disabled={busy || eventForm.formState.isSubmitting} className="rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Create event</button>
                {eventForm.formState.errors.title && <p role="alert" className="text-xs text-rose-600">{eventForm.formState.errors.title.message}</p>}
                {eventForm.formState.errors.description && <p role="alert" className="text-xs text-rose-600">{eventForm.formState.errors.description.message}</p>}
              </form>
            </section>
            {isAdmin && <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"><h3 className="font-semibold text-sm mb-2 flex gap-2 items-center"><Megaphone size={16}/> Post announcement</h3><textarea value={announcement} onChange={e=>setAnnouncement(e.target.value)} rows={2} maxLength={2000} placeholder="Write an announcement..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.07]"/><button disabled={busy || !announcement.trim()} onClick={async()=>{const saved=await act({action:"announce",text:announcement});if(saved)setAnnouncement("")}} className="mt-2 rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Publish</button></section>}
            <section><h3 className="font-semibold text-sm mb-2">Polls</h3>{features.polls.length===0?<p className="text-xs text-slate-500 dark:text-slate-400">No polls yet.</p>:features.polls.map(poll=>{const selected=pollSelections[poll.id]??poll.myOptionIds??[];return <div key={poll.id} className="rounded-xl border border-slate-200 bg-white p-3 mb-2 dark:border-white/10 dark:bg-white/[0.03]"><p className="text-sm font-medium mb-2">{poll.question}</p><div className="space-y-1">{poll.options.map((option:any)=><button type="button" key={option.id} disabled={busy || poll.closed} onClick={()=>togglePollOption(poll,option.id)} className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs text-left border ${selected.includes(option.id)?"bg-indigo-50 border-indigo-300 dark:bg-indigo-400/10 dark:border-indigo-400/40":"bg-white dark:bg-white/[0.04] border-transparent"}`}><span>{option.label}</span><span className="text-slate-500 dark:text-slate-400">{Math.max(0, (option.votes?.length || 0) - ((poll.myOptionIds || []).includes(option.id) ? 1 : 0) + (selected.includes(option.id) ? 1 : 0))} <Check size={12} className="inline"/></span></button>)}</div>{poll.multiple&&<button type="button" disabled={busy||selected.length===0||poll.closed} onClick={()=>submitPollSelections(poll)} className="mt-2 rounded-xl bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Submit selections</button>}</div>})}</section>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold">Group calendar</p><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">A shared view of upcoming plans.</p></div><div className="flex items-center gap-1"><button type="button" aria-label="Previous month" onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><ChevronLeft size={16}/></button><span className="min-w-24 text-center text-xs font-semibold">{calendarMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</span><button type="button" aria-label="Next month" onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><ChevronRight size={16}/></button></div></div>
              <div className="mb-1 grid grid-cols-7 gap-1">{["S","M","T","W","T","F","S"].map((day,index)=><span key={day+index} className="py-1 text-center text-[10px] font-semibold text-slate-400">{day}</span>)}</div>
              <div className="grid grid-cols-7 gap-1">{calendarDays.map((day,index)=>{const inMonth=day.getMonth()===calendarMonth.getMonth();const hasEvent=features.events.some(event=>[event.startsAt,...(event.timeOptions||[]).map((option:any)=>option.startsAt)].some(value=>{const date=new Date(value);return date.getFullYear()===day.getFullYear()&&date.getMonth()===day.getMonth()&&date.getDate()===day.getDate()}));const selected=!!selectedCalendarDay&&selectedCalendarDay.toDateString()===day.toDateString();const today=day.toDateString()===new Date().toDateString();return <button type="button" key={index} onClick={()=>setSelectedCalendarDay(selected?null:day)} className={"relative flex h-9 flex-col items-center justify-center rounded-lg text-xs transition "+(selected?"bg-indigo-600 font-semibold text-white":today?"bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200":inMonth?"text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10":"text-slate-300 dark:text-slate-600")}><span>{day.getDate()}</span>{hasEvent&&<span className={"mt-0.5 h-1 w-1 rounded-full "+(selected?"bg-white":"bg-indigo-500")}/>}</button>})}</div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10"><p className="text-[11px] text-slate-500 dark:text-slate-400">{selectedCalendarDay?selectedCalendarDay.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}):"Select a day to filter events"}</p>{selectedCalendarDay&&<button type="button" onClick={()=>setSelectedCalendarDay(null)} className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300">Show all events</button>}</div>
            </section>
            <section><h3 className="font-semibold text-sm mb-2">Events</h3>{visibleEvents.length===0?<p className="text-xs text-slate-500 dark:text-slate-400">No upcoming events.</p>:visibleEvents.map(event=><div key={event.id} className="rounded-xl border border-slate-200 bg-white p-3 mb-2 dark:border-white/10 dark:bg-white/[0.03]"><p className="text-sm font-medium">{event.title}</p><p className="text-xs text-slate-500 dark:text-slate-400">{new Date(event.startsAt).toLocaleString()}</p>{event.description&&<p className="text-xs mt-1">{event.description}</p>}{event.timeOptions?.length>0&&<div className="mt-3 rounded-xl bg-indigo-50/70 p-3 dark:bg-indigo-400/[0.06]"><p className="mb-2 text-xs font-semibold">Vote for a time</p>{event.timeOptions.map((option:any)=><label key={option.id} className="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.04]"><span className="flex items-center gap-2"><input type="checkbox" disabled={busy} className="h-4 w-4 rounded border-slate-300 accent-indigo-600 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 dark:border-white/20" checked={(eventSelections[event.id]??event.myOptionIds??[]).includes(option.id)} onChange={e=>setEventSelections(prev=>{const current=prev[event.id]??event.myOptionIds??[];return {...prev,[event.id]:e.target.checked?[...current,option.id]:current.filter(id=>id!==option.id)}})}/>{new Date(option.startsAt).toLocaleString()}</span><span className="text-slate-500">{Math.max(0, (option.votes?.length || 0) - ((event.myOptionIds || []).includes(option.id) ? 1 : 0) + ((eventSelections[event.id] ?? event.myOptionIds ?? []).includes(option.id) ? 1 : 0))} votes</span></label>)}<button type="button" disabled={busy||!(eventSelections[event.id]??event.myOptionIds??[]).length} onClick={()=>submitEventVote(event)} className="mt-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Submit vote</button></div>}<div className="flex gap-2 mt-2">{(["going","maybe","not-going"] as const).map(response=><button type="button" key={response} disabled={busy} onClick={()=>act({action:"respondEvent",eventId:event.id,response})} className={"rounded-lg border px-2 py-1 text-[11px] capitalize transition " + (event.myResponse===response ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-400/50 dark:bg-indigo-400/10" : "border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10")}>{response.replace("-"," ")}</button>)}</div><p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400"><Users size={11} className="mr-1 inline"/>{event.responses?.going?.length||0} going · {event.responses?.maybe?.length||0} maybe · {event.responses?.["not-going"]?.length||0} not going</p></div>)}</section>
            <section><h3 className="font-semibold text-sm mb-2">Announcements</h3>{features.announcements.length===0?<p className="text-xs text-slate-500 dark:text-slate-400">No announcements yet.</p>:features.announcements.map(item=><div key={item.id} className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 mb-2"><p className="text-sm">{item.text}</p><p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{new Date(item.createdAt).toLocaleString()}</p></div>)}</section>
          </div>}
        </Dialog.Panel>
      </div></div>
    </Dialog>
  )
}
export default GroupFeaturesPanel
