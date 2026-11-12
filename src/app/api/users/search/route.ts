import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const query = (searchParams.get('q') || '').trim().toLowerCase()

        if (!query || query.length < 1) {
            return Response.json([])
        }

        // 1. Gather all user IDs registered in system
        let userIds = (await db.smembers('users')) as string[]
        if (!userIds || userIds.length === 0) {
            userIds = []
        }

        // Also check direct exact index matches in case user wasn't in users set
        const exactEmailId = (await db.get(`user:email:${query}`)) as string | null
        const exactNameId = (await db.get(`user:name:${query}`)) as string | null

        const candidateIds = Array.from(new Set([
            ...userIds,
            ...(exactEmailId ? [exactEmailId] : []),
            ...(exactNameId ? [exactNameId] : [])
        ]))

        if (candidateIds.length === 0) {
            return Response.json([])
        }

        // 2. Batch fetch profiles
        const pipeline = db.pipeline()
        for (const uid of candidateIds) {
            pipeline.get(`user:${uid}`)
        }
        const rawResults = await pipeline.exec()

        // 3. Filter matching users (by name, stripped username, or email)
        const matchedUsers: User[] = []
        for (const raw of rawResults) {
            if (!raw) continue
            try {
                const u = (typeof raw === 'string' ? JSON.parse(raw) : raw) as User
                if (!u || !u.id) continue

                const nameLower = (u.name || '').toLowerCase()
                const nameStripped = nameLower.replace(/\s+/g, '')
                const emailLower = (u.email || '').toLowerCase()

                if (
                    nameLower.includes(query) ||
                    nameStripped.includes(query) ||
                    emailLower.includes(query)
                ) {
                    matchedUsers.push(u)
                }
            } catch {}
        }

        if (matchedUsers.length === 0) {
            return Response.json([])
        }

        // Limit to top 15 results
        const limitedMatches = matchedUsers.slice(0, 15)

        // 4. Batch query relationship status (friends / requests)
        const statusPipeline = db.pipeline()
        for (const u of limitedMatches) {
            statusPipeline.sismember(`user:${session.user.id}:friends`, u.id)
            statusPipeline.sismember(`user:${u.id}:incoming_friend_requests`, session.user.id)
            statusPipeline.sismember(`user:${session.user.id}:incoming_friend_requests`, u.id)
        }
        const statusResults = await statusPipeline.exec()

        const finalResults = limitedMatches.map((u, i) => {
            const isFriend = statusResults[i * 3] === 1
            const isPending = statusResults[i * 3 + 1] === 1
            const hasRequestedMe = statusResults[i * 3 + 2] === 1
            const isSelf = u.id === session.user.id

            return {
                id: u.id,
                name: u.name,
                email: u.email,
                image: u.image,
                isSelf,
                isFriend,
                isPending,
                hasRequestedMe
            }
        })

        return Response.json(finalResults)
    } catch (error) {
        console.error("User search error:", error)
        return new Response(JSON.stringify({ message: "Search failed" }), { status: 500 })
    }
}

