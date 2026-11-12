import { authOptions } from "@/lib/auth"
import { getFriendsByUserId } from "@/helpers/getFriendsByUserId"
import { getServerSession } from "next-auth"

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
        }

        const friends = await getFriendsByUserId(session.user.id)
        return Response.json(friends)
    } catch (error) {
        return new Response(JSON.stringify({ message: "Failed to list friends" }), { status: 500 })
    }
}

