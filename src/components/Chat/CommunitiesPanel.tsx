"use client"

import { FC, FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Users, Plus, Loader2, Check, X, Search, Pencil, Trash2, LogOut, Save, Layers3, UserPlus, ChevronDown, ChevronUp } from "lucide-react"

interface Community {
  id: string
  name: string
  description: string
  groupIds: string[]
  ownerId: string
  memberIds: string[]
  adminIds?: string[]
  isAdmin?: boolean
  isOwner?: boolean
}
interface Props { groups: Group[] }

const CommunitiesPanel: FC<Props> = ({ groups }) => {
  const [items, setItems] = useState<Community[]>([])
  const [invites, setInvites] = useState<Community[]>([])
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: "", description: "" })
  const [memberInput, setMemberInput] = useState<Record<string, string>>({})
  const [groupInput, setGroupInput] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await axios.get("/api/community")
      setItems(response.data.communities || [])
      setInvites(response.data.invites || [])
    } catch { toast.error("Unable to load communities") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? items.filter(item => item.name.toLowerCase().includes(term) || (item.description || "").toLowerCase().includes(term)) : items
  }, [items, query])

  const mutate = async (community: Community, payload: Record<string, unknown>, success: string) => {
    if (actionId) return false
    setActionId(community.id)
    try {
      await axios.post(`/api/community/${community.id}`, payload)
      await load()
      toast.success(success)
      return true
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Unable to update community")
      return false
    } finally { setActionId(null) }
  }

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || name.trim().length < 2) return
    setBusy(true)
    try {
      await axios.post("/api/community", { name: name.trim(), description: description.trim(), groupIds: selected })
      setName(""); setDescription(""); setSelected([])
      await load()
      toast.success("Community created")
    } catch (error: any) { toast.error(error?.response?.data?.message || "Unable to create community") }
    finally { setBusy(false) }
  }

  const saveEdit = async (community: Community) => {
    const saved = await mutate(community, { action: "update", name: draft.name.trim(), description: draft.description.trim() }, "Community updated")
    if (saved) setEditingId(null)
  }

  const addMember = async (community: Community, event: FormEvent) => {
    event.preventDefault()
    const value = (memberInput[community.id] || "").trim()
    if (!value) return
    const saved = await mutate(community, { action: "addMember", memberId: value }, "Member added")
    if (saved) setMemberInput(current => ({ ...current, [community.id]: "" }))
  }

  const acceptInvite = (community: Community) => void mutate(community, { action: "acceptInvite" }, "You joined the community")
  const declineInvite = (community: Community) => void mutate(community, { action: "declineInvite" }, "Invitation declined")

  const deleteCommunity = async (community: Community) => {
    if (!window.confirm(`Delete “${community.name}”? This removes the community and unlinks its groups. The groups themselves will remain.`)) return
    await mutate(community, { action: "delete" }, "Community deleted")
  }

  const leaveCommunity = async (community: Community) => {
    if (!window.confirm(`Leave “${community.name}”?`)) return
    await mutate(community, { action: "leave" }, "You left the community")
  }

  return (
    <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/70 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300"><Users size={19}/></div>
          <div><h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">Communities</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">A home for related groups, members and shared conversations.</p></div>
        </div>
        <div className="flex gap-2 text-[11px]">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">{items.length} joined</span>
          {invites.length > 0 && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-200">{invites.length} pending</span>}
        </div>
      </header>

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/50 p-4 dark:border-indigo-400/15 dark:from-indigo-400/[0.07] dark:via-slate-950/20 dark:to-violet-400/[0.04]">
        <div className="mb-3 flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-white p-2 text-indigo-600 shadow-sm dark:bg-white/10 dark:text-indigo-300"><Layers3 size={16}/></div><div><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">What is a community?</h3><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-300">A community is an umbrella for multiple related group chats. For example, a company community can contain Engineering, Design and Announcements groups. Members can find the groups that belong together without mixing their separate conversations.</p></div></div>
        <div className="grid gap-2 sm:grid-cols-3">
          {["Create a community","Add or organize groups","Invite and manage members"].map((step,index)=><div key={step} className="flex items-center gap-2 rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200">{index+1}</span>{step}</div>)}
        </div>
      </div>

      {invites.length > 0 && <section className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Invitations</h3><span className="text-[10px] text-slate-400">{invites.length} awaiting response</span></div>
        {invites.map(item => <article key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/70 p-3 dark:border-indigo-400/20 dark:bg-indigo-400/[0.06]">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.name}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.description || "You have been invited to join this community."}</p></div>
          <div className="flex gap-2"><button type="button" disabled={!!actionId} onClick={() => acceptInvite(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"><Check size={13}/> Join</button><button type="button" disabled={!!actionId} onClick={() => declineInvite(item)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><X size={13}/></button></div>
        </article>)}
      </section>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your communities</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Browse and manage every community you belong to.</p></div><div className="relative w-full sm:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search communities…" aria-label="Search communities" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-100"/></div></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500"><Loader2 size={16} className="animate-spin text-indigo-500"/> Loading your communities…</div>
        : visibleItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700"><Users size={24} className="mx-auto text-slate-400"/><p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{items.length ? "No matching communities" : "No communities yet"}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{items.length ? "Try another search term." : "Create your first community below, then link your existing group chats."}</p></div>
        : <div className="grid gap-3 lg:grid-cols-2">{visibleItems.map(item => {
          const linkedGroups = (item.groupIds || []).map(id => groups.find(group => group.id === id)).filter(Boolean) as Group[]
          const availableGroups = groups.filter(group => !item.groupIds?.includes(group.id))
          const expanded = expandedId === item.id
          const editing = editingId === item.id
          return <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-white/10 dark:bg-slate-800/35 dark:hover:border-indigo-400/30">
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editing ? <div className="space-y-2"><input value={draft.name} onChange={event => setDraft(current => ({...current,name:event.target.value}))} maxLength={60} minLength={2} aria-label="Community name" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-950 dark:text-white"/><textarea value={draft.description} onChange={event => setDraft(current => ({...current,description:event.target.value}))} maxLength={500} rows={2} aria-label="Community description" className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-950 dark:text-white"/></div>
                  : <><h4 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.name}</h4><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.description || "No description yet. Add one to explain what this community is for."}</p></>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">{item.isOwner && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">Owner</span>}{item.isAdmin && !item.isOwner && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300">Admin</span>}</div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/[0.06]">{linkedGroups.length} groups</span><span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-white/[0.06]">{item.memberIds?.length || 1} members</span></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
                <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-300">{expanded ? "Hide details" : "Manage community"}{expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
                <div className="flex flex-wrap items-center gap-1.5">
                  {editing ? <><button type="button" disabled={!!actionId || draft.name.trim().length<2} onClick={() => void saveEdit(item)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"><Save size={12}/> Save</button><button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-600 dark:border-white/10 dark:text-slate-300">Cancel</button></>
                  : item.isAdmin && <button type="button" onClick={() => {setDraft({name:item.name,description:item.description||""});setEditingId(item.id);setExpandedId(item.id)}} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]"><Pencil size={12}/> Edit</button>}
                  {item.isOwner ? <button type="button" disabled={!!actionId} onClick={() => void deleteCommunity(item)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-400/20 dark:text-rose-300 dark:hover:bg-rose-400/10"><Trash2 size={12}/> Delete</button>
                  : <button type="button" disabled={!!actionId} onClick={() => void leaveCommunity(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300"><LogOut size={12}/> Leave</button>}
                </div>
              </div>
            </div>
            {expanded && <div className="space-y-4 border-t border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/20">
              <div><div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Linked groups</p><span className="text-[10px] text-slate-400">{linkedGroups.length} linked</span></div>
                {linkedGroups.length ? <div className="space-y-1.5">{linkedGroups.map(group => <div key={group.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]"><span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{group.name}</span>{item.isAdmin && <button type="button" disabled={!!actionId} onClick={() => void mutate(item,{action:"removeGroup",groupId:group.id},"Group unlinked")} aria-label={`Unlink ${group.name}`} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-400/10"><X size={14}/></button>}</div>)}</div> : <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700">No groups linked yet.</p>}
                {item.isAdmin && availableGroups.length > 0 && <div className="mt-2 flex gap-2"><select value={groupInput[item.id] || ""} onChange={event => setGroupInput(current => ({...current,[item.id]:event.target.value}))} aria-label="Choose a group to link" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"><option value="">Choose a group to link…</option>{availableGroups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="button" disabled={!!actionId || !groupInput[item.id]} onClick={async()=>{const saved=await mutate(item,{action:"addGroup",groupId:groupInput[item.id]},"Group linked");if(saved)setGroupInput(current=>({...current,[item.id]:""}))}} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add</button></div>}
              </div>
              {item.isAdmin && <form onSubmit={event => void addMember(item,event)} className="border-t border-slate-200 pt-3 dark:border-white/10"><label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Add a member</label><div className="flex gap-2"><input value={memberInput[item.id]||""} onChange={event=>setMemberInput(current=>({...current,[item.id]:event.target.value}))} placeholder="Email address or user ID" aria-label={`Member email or ID for ${item.name}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-900 dark:text-white"/><button type="submit" disabled={!!actionId || !(memberInput[item.id]||"").trim()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><UserPlus size={13}/> Add</button></div><p className="mt-1.5 text-[10px] text-slate-400">Members can be added by their registered email address or account ID.</p></form>}
              <div className="border-t border-slate-200 pt-3 dark:border-white/10"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Members</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{item.memberIds?.length || 1} people are part of this community. Member IDs are kept private in this view.</p></div>
            </div>}
          </article>
        })}</div>}
      </section>

      <form onSubmit={create} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="flex items-start gap-3"><div className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200"><Plus size={16}/></div><div><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create a community</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Give it a clear purpose, then add the group chats that belong together.</p></div></div>
        <input required minLength={2} maxLength={60} value={name} onChange={event=>setName(event.target.value)} placeholder="Community name" aria-label="New community name" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"/>
        <textarea maxLength={500} value={description} onChange={event=>setDescription(event.target.value)} placeholder="What is this community for? (optional)" rows={2} aria-label="New community description" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"/>
        <div className="space-y-2"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Add existing groups <span className="font-normal normal-case tracking-normal">(optional)</span></p><div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950/40">
          {groups.length ? groups.map(group=><label key={group.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-xs text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.04]"><input type="checkbox" checked={selected.includes(group.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,group.id]:current.filter(id=>id!==group.id))}/><span className="min-w-0 flex-1 truncate">{group.name}</span></label>) : <p className="px-2 py-3 text-xs text-slate-500">Create a group chat first to link it here.</p>}
        </div></div>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-slate-500 dark:text-slate-400">{selected.length} groups selected</p><button type="submit" disabled={busy || name.trim().length<2} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950">{busy?<Loader2 size={14} className="animate-spin"/>:<Plus size={14}/>} {busy ? "Creating…" : "Create community"}</button></div>
      </form>
    </section>
  )
}
export default CommunitiesPanel
