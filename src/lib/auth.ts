import { UpstashRedisAdapter } from "@next-auth/upstash-redis-adapter"
import { NextAuthOptions } from "next-auth"
import { db } from "./db"
import GoogleProvider from 'next-auth/providers/google'

const getGoogleCredentials=()=>{
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret= process.env.GOOGLE_CLIENT_SECRET

    if(!clientId || clientId?.length === 0){
        throw new Error('Missing GOOGLE_CLIENT_ID')
    }

    if(!clientSecret || clientSecret?.length === 0){
        throw new Error('Missing GOOGLE_CLIENT_SECRET')
    }

    return {clientId, clientSecret}
}

export const authOptions: NextAuthOptions ={
    adapter:  UpstashRedisAdapter(db),  /* everytime someone calls this authentication function if they login,
                a certain action with our database will be taken automatically */
    session: {
        strategy: 'jwt' // to handle the session and verify it on the routes easily
    },
    pages:{
        signIn: '/login'
    },
    providers:[
        GoogleProvider({
            clientId: getGoogleCredentials()?.clientId,
            clientSecret: getGoogleCredentials()?.clientSecret
        })
    ],
    callbacks:{
        async jwt({token, user}){
            const dbUser= (await db.get(`user:${token.id}`)) as User | null       //checking if user exists on database

            if(!dbUser){
                token.id = user!.id
                return token
            }

            return {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                picture: dbUser.image
            }
        },
        async session({session, token}){        //session callback
            if(token){
                session.user.id= token?.id
                session.user.email= token?.email
                session.user.image= token?.picture
                session.user.name= token?.name
            }

            return session
        },
        redirect(){
            return '/dashboard'
        }
    }
}