import { authOptions } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { z } from "zod"

export async function POST(req:Request) {
    try {
        const body= await req.json()

        const {id: idToAdd}= z.object({id: z.string()}).parse(body)

        const session= await getServerSession(authOptions)

        //checking if the user is logged in or not
        if(!session){
            return new Response('UnAuthorized')
        }
    } catch (error) {
        
    }
}