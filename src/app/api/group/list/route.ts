import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
        }

        const groupIds = (await db.smembers(`user:${session.user.id}:groups`)) as string[]
        if (!groupIds || groupIds.length === 0) {
            return Response.json([])
        }

        const pipeline = db.pipeline()
        for (const gid of groupIds) {
            pipeline.get(`group:${gid}`)
        }
        const rawGroups = await pipeline.exec()

        const groups: Group[] = []
        for (const raw of rawGroups) {
            if (!raw) continue
            try {
                const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Group
                if (parsed && parsed.id) {
                    groups.push(parsed)
                }
            } catch {}
        }

        return Response.json(groups)
    } catch (error) {
        console.error("List groups error:", error)
        return new Response(JSON.stringify({ message: "Failed to list groups" }), { status: 500 })
    }
}
