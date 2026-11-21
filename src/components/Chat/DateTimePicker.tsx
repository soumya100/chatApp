"use client"

import { useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react"

type Props = { value: string; onChange: (value: string) => void; label: string; disabled?: boolean }

const pad = (value: number) => String(value).padStart(2, "0")
const toValue = (date: Date, hour: number, minute: number) =>
  `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}`

export default function DateTimePicker({ value, onChange, label, disabled }: Props) {
  const parsed = value ? new Date(value) : null
  const valid = parsed && !Number.isNaN(parsed.getTime())
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => valid ? new Date(parsed!.getFullYear(), parsed!.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const hour = valid ? parsed!.getHours() : 18
  const minute = valid ? parsed!.getMinutes() : 0
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = new Date(first)
    start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start)
      day.setDate(start.getDate() + index)
      return day
    })
  }, [month])
  const today = new Date()
  const chooseDay = (day: Date) => {
    onChange(toValue(day, hour, minute))
  }
  const changeTime = (nextHour: number, nextMinute: number) => {
    const base = valid ? parsed! : new Date()
    onChange(toValue(base, nextHour, nextMinute))
  }

  return <div className="relative min-w-0">
    <button type="button" disabled={disabled} aria-label={label} aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs shadow-sm transition hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/10 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/70 dark:hover:border-indigo-400/50">
      <span className="flex min-w-0 items-center gap-2"><CalendarDays size={14} className="shrink-0 text-indigo-500"/><span className={valid ? "truncate font-medium text-slate-700 dark:text-slate-200" : "text-slate-400"}>{valid ? parsed!.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Choose date and time"}</span></span>
      <Clock3 size={14} className="shrink-0 text-slate-400"/>
    </button>
    {open && <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[min(21rem,calc(100vw-3.5rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/15 dark:border-white/10 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><ChevronLeft size={16}/></button>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{month.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</p>
        <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><ChevronRight size={16}/></button>
      </div>
      <div className="mb-1 grid grid-cols-7">{["S","M","T","W","T","F","S"].map((day,index)=><span key={day+index} className="py-1 text-center text-[10px] font-semibold text-slate-400">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">{days.map((day,index) => {
        const inMonth = day.getMonth() === month.getMonth()
        const selected = valid && day.toDateString() === parsed!.toDateString()
        const isToday = day.toDateString() === today.toDateString()
        const past = new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime() < new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime()
        return <button type="button" key={index} disabled={past} onClick={() => chooseDay(day)} className={`h-9 rounded-lg text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-25 ${selected ? "bg-indigo-600 text-white shadow-sm" : isToday ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200" : inMonth ? "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10" : "text-slate-300 dark:text-slate-600"}`}>{day.getDate()}</button>
      })}</div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/10">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Start time</span>
        <div className="flex items-center gap-2">
          <select aria-label="Hour" value={hour} onChange={event => changeTime(Number(event.target.value),minute)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100">{Array.from({length:24},(_,index)=><option key={index} value={index}>{pad(index)}</option>)}</select>
          <span className="text-slate-400">:</span>
          <select aria-label="Minute" value={minute} onChange={event => changeTime(hour,Number(event.target.value))} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100">{[0,5,10,15,20,25,30,35,40,45,50,55].map(value=><option key={value} value={value}>{pad(value)}</option>)}</select>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-500">Done</button>
        </div>
      </div>
    </div>}
  </div>
}
