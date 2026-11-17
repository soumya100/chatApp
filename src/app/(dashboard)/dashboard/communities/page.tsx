import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import CommunitiesPanel from "@/components/Chat/CommunitiesPanel"

export const dynamic = "force-dynamic"
export default async function CommunitiesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")
  const ids = await db.smembers(`user:${session.user.id}:groups`) as string[]
  const groups: Group[] = []
  if (ids?.length) {
    const pipeline = db.pipeline()
    ids.forEach(id => pipeline.get(`group:${id}`))
    const rows = await pipeline.exec()
    rows.forEach(raw => { try { const value = typeof raw === "string" ? JSON.parse(raw) : raw; if (value) groups.push(value as Group) } catch {} })
  }
  return <main className="mx-auto max-w-3xl p-4 sm:p-8"><div className="mb-6"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Communities</h1><p className="text-sm text-gray-500 mt-1">Bring related groups together under one community.</p></div><CommunitiesPanel groups={groups}/></main>
}
