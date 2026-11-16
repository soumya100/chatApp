"use client"

import { FC, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { Pin, X } from "lucide-react"

interface Props { groupId: string }
const PinnedMessagesBanner: FC<Props> = ({ groupId }) => {
  const [items,setItems] = useState<Message[]>([])
  const [expanded,setExpanded] = useState(false)
  useEffect(() => {
    let active = true
    const load = async () => { try { const r = await axios.get(`/api/group/${groupId}/pin`); if (active) setItems(r.data.messages || []) } catch { /* group membership may have changed */ } }
    load()
    return () => { active = false }
  }, [groupId])
  if (!items.length) return null
  return <div className="border-b border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 px-4 py-2">
    <button onClick={() => setExpanded(v=>!v)} className="flex items-center gap-2 w-full text-left">
      <Pin size={14} className="text-indigo-600 dark:text-indigo-400"/>
      <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">Pinned messages ({items.length})</span>
      <span className="ml-auto text-[11px] text-indigo-600 dark:text-indigo-400">{expanded ? "Hide" : "View"}</span>
    </button>
    {expanded && <div className="mt-2 space-y-2">{items.map(item=><div key={item.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200"><span className="min-w-0 flex-1 truncate">{item.text || item.fileName || "Attachment"}</span><button onClick={async()=>{try{await axios.post(`/api/group/${groupId}/pin`,{messageId:item.id,pinned:false});setItems(prev=>prev.filter(x=>x.id!==item.id));toast.success("Message unpinned")}catch(e:any){toast.error(e?.response?.data?.message || "Unable to unpin message")}}} title="Unpin" className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900"><X size={13}/></button></div>)}</div>}
  </div>
}
export default PinnedMessagesBanner
