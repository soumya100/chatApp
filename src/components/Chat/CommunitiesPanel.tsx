"use client"

import { FC, FormEvent, useCallback, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Users, Plus, Loader2, Check, X } from "lucide-react"

interface Community { id: string; name: string; description: string; groupIds: string[]; ownerId: string; memberIds: string[]; adminIds?: string[]; isAdmin?: boolean }
interface Props { groups: Group[] }
const CommunitiesPanel: FC<Props> = ({ groups }) => {
  const [items,setItems] = useState<Community[]>([])
  const [invites,setInvites] = useState<Community[]>([])
  const [name,setName] = useState("")
  const [description,setDescription] = useState("")
  const [selected,setSelected] = useState<string[]>([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [memberIds,setMemberIds] = useState<Record<string,string>>({})
  const [addingTo,setAddingTo] = useState<string | null>(null)
  const [inviteBusyId,setInviteBusyId] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const r = await axios.get("/api/community")
      setItems(r.data.communities || [])
      setInvites(r.data.invites || [])
    } catch { toast.error("Unable to load communities") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await axios.post("/api/community",{name,description,groupIds:selected})
      setName(""); setDescription(""); setSelected([])
      await load(); toast.success("Community created")
    } catch (error:any) { toast.error(error?.response?.data?.message || "Unable to create community") }
    finally { setBusy(false) }
  }
  const acceptInvite = async (community: Community) => {
    if (inviteBusyId) return
    setInviteBusyId(community.id)
    try {
      await axios.post(`/api/community/${community.id}`,{action:"acceptInvite"})
      await load()
      toast.success("Community invitation accepted")
    } catch (error:any) { toast.error(error?.response?.data?.message || "Unable to accept invitation") }
    finally { setInviteBusyId(null) }
  }
  const declineInvite = async (community: Community) => {
    if (inviteBusyId) return
    setInviteBusyId(community.id)
    try {
      await axios.post(`/api/community/${community.id}`,{action:"declineInvite"})
      await load()
      toast.success("Community invitation declined")
    } catch (error:any) { toast.error(error?.response?.data?.message || "Unable to decline invitation") }
    finally { setInviteBusyId(null) }
  }
  const addMember = async (community: Community, e: FormEvent) => {
    e.preventDefault()
    const memberId = (memberIds[community.id] || "").trim()
    if (!memberId || addingTo) return
    setAddingTo(community.id)
    try {
      await axios.post(`/api/community/${community.id}`,{action:"addMember",memberId})
      setMemberIds(previous => ({ ...previous, [community.id]: "" }))
      await load()
      toast.success("Member added to community")
    } catch (error:any) { toast.error(error?.response?.data?.message || "Unable to add member") }
    finally { setAddingTo(null) }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/70">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300"><Users size={18}/></div>
        <div><h2 className="text-sm font-semibold tracking-tight">Communities</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Bring related groups together in one place.</p></div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500"><Loader2 size={16} className="animate-spin text-indigo-500"/> Loading communities…</div>
      ) : (
        <div className="space-y-3">
          {invites.length > 0 && <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Invitations</p>
            {invites.map(item=><article key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/70 p-3 dark:border-indigo-400/20 dark:bg-indigo-400/[0.06]">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.name}</p><p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{item.description || "You have been invited to join this community."}</p></div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={!!inviteBusyId} onClick={()=>acceptInvite(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950"><Check size={13}/> Accept</button>
                <button type="button" disabled={!!inviteBusyId} onClick={()=>declineInvite(item)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">Decline</button>
              </div>
            </article>)}
          </div>}
          {items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/35">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.name}</p><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.description || "No description added."}</p></div>
              {item.isAdmin && <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">Admin</span>}
            </div>
            <p className="mt-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">{item.groupIds?.length || 0} linked groups <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span> {item.memberIds?.length || 1} members</p>
            {item.isAdmin && <form onSubmit={e=>addMember(item,e)} className="mt-4 flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              <input value={memberIds[item.id] || ""} onChange={e=>setMemberIds(previous=>({...previous,[item.id]:e.target.value}))} disabled={addingTo===item.id} aria-label={`Email address or user ID to add to ${item.name}`} placeholder="Enter email address or user ID" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400"/>
              <button type="submit" disabled={addingTo===item.id || !(memberIds[item.id] || "").trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900">{addingTo===item.id?<Loader2 size={13} className="animate-spin"/>:<Plus size={13}/>} Add member</button>
            </form>}
          </article>)}
          {items.length===0 && invites.length===0 && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700"><Users size={22} className="mx-auto text-slate-400"/><p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">No communities yet</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Create one to organize your groups and members.</p></div>}
        </div>
      )}
      <form onSubmit={create} className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800">
        <div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Create a community</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Choose a name and optionally link existing groups.</p></div>
        <input required minLength={2} maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="Community name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:bg-slate-950"/>
        <textarea maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (optional)" rows={3} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:bg-slate-950"/>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Link existing groups</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/40">
            {groups.length ? groups.map(g=><label key={g.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-xs text-slate-700 transition hover:bg-white dark:text-slate-300 dark:hover:bg-white/[0.04]"><input type="checkbox" checked={selected.includes(g.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,g.id]:v.filter(id=>id!==g.id))}/><span className="min-w-0 flex-1 truncate">{g.name}</span></label>) : <p className="px-2 py-3 text-xs text-slate-500">Create a group first to link it here.</p>}
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={busy || name.trim().length<2} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/15 transition hover:from-indigo-500 hover:to-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950">{busy?<Loader2 size={14} className="animate-spin"/>:<Plus size={14}/>} {busy ? "Creating community…" : "Create community"}</button>
        </div>
      </form>
    </section>
  )
}
export default CommunitiesPanel
