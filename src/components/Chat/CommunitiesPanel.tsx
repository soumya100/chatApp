"use client"

import { FC, FormEvent, useCallback, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Users, Plus, Loader2, Check, X } from "lucide-react"

interface Community { id: string; name: string; description: string; groupIds: string[]; ownerId: string; memberIds: string[]; adminIds?: string[] }
interface Props { groups: Group[] }
const CommunitiesPanel: FC<Props> = ({ groups }) => {
  const [items,setItems] = useState<Community[]>([])
  const [invites,setInvites] = useState<Community[]>([])
  const [name,setName] = useState("")
  const [description,setDescription] = useState("")
  const [selected,setSelected] = useState<string[]>([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [memberId,setMemberId] = useState("")
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
    try {
      await axios.post(`/api/community/${community.id}`,{action:"acceptInvite"})
      await load()
      toast.success("Community invitation accepted")
    } catch (error:any) { toast.error(error?.response?.data?.message || "Unable to accept invitation") }
  }
  const declineInvite = async (community: Community) => {
    try {
      await axios.post(`/api/community/${community.id}`,{action:"declineInvite"})
      await load()
      toast.success("Community invitation declined")
    } catch (error:any) { toast.error(error?.response?.data?.message || "Unable to decline invitation") }
  }
  const inviteMember = async (community: Community, e: FormEvent) => {
    e.preventDefault()
    if (!memberId.trim()) return
    try {
      await axios.post(`/api/community/${community.id}`,{action:"addMember",memberId:memberId.trim()})
      setMemberId("")
      await load()
      toast.success("Member added to community")
    } catch (error:any) { toast.error(error?.response?.data?.message || "Unable to add member") }
  }

  return <section className="rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4">
    <div className="flex items-center gap-2"><Users size={18}/><h2 className="font-semibold">Communities</h2></div>
    {loading ? <Loader2 className="animate-spin"/> : <>
      {invites.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-gray-500">Invitations</p>{invites.map(item=><article key={item.id} className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 flex items-center gap-3"><div className="min-w-0 flex-1"><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-gray-500">{item.description}</p></div><button onClick={()=>acceptInvite(item)} className="rounded-lg bg-indigo-600 text-white px-2.5 py-1.5 text-xs flex items-center gap-1"><Check size={13}/> Accept</button><button onClick={()=>declineInvite(item)} className="rounded-lg border border-gray-300 dark:border-zinc-700 px-2.5 py-1.5 text-xs flex items-center gap-1"><X size={13}/> Decline</button></article>)}</div>}
      {items.map(item => <article key={item.id} className="rounded-xl bg-gray-50 dark:bg-zinc-800 p-3"><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-gray-500 mt-1">{item.description}</p><p className="text-xs text-gray-500 mt-2">{item.groupIds?.length || 0} linked groups · {item.memberIds?.length || 1} members</p><form onSubmit={e=>inviteMember(item,e)} className="mt-3 flex gap-2"><input value={memberId} onChange={e=>setMemberId(e.target.value)} placeholder="User ID to add" className="min-w-0 flex-1 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs"/><button className="rounded-lg bg-indigo-600 text-white px-2 py-1.5 text-xs">Add member</button></form></article>)}
      {items.length===0 && invites.length===0 && <p className="text-xs text-gray-500">No communities yet.</p>}
    </>}
    <form onSubmit={create} className="border-t border-gray-200 dark:border-zinc-800 pt-4 space-y-2">
      <p className="text-sm font-semibold">Create a community</p>
      <input required minLength={2} maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="Community name" className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-3 py-2 text-sm"/>
      <textarea maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (optional)" className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-3 py-2 text-sm"/>
      <div className="max-h-32 overflow-y-auto space-y-1">{groups.map(g=><label key={g.id} className="flex gap-2 items-center text-xs"><input type="checkbox" checked={selected.includes(g.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,g.id]:v.filter(id=>id!==g.id))}/>{g.name}</label>)}</div>
      <button disabled={busy || name.trim().length<2} className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs font-semibold disabled:opacity-50 flex items-center gap-2"><Plus size={14}/>{busy ? "Creating…" : "Create community"}</button>
    </form>
  </section>
}
export default CommunitiesPanel
