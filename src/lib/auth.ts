import { UpstashRedisAdapter } from "@next-auth/upstash-redis-adapter"
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { db } from "./db"
import { fetchRedis } from "@/helpers/redis"

// VAPT Timing Attack Mitigation:
// Constant-time dummy hash used to neutralize timing discrepancies when querying non-existent accounts
const DUMMY_BCRYPT_HASH = "$2a$12$e80yq7yvN6Z8aC0x6mE7b.z6d5O/81s4Wz7rB5Z3f6T7U2e1q0n8."

const providers: NextAuthOptions["providers"] = [
    CredentialsProvider({
        id: "credentials",
        name: "Credentials",
        credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" }
        },
        async authorize(credentials) {
            // VAPT Hardening: Generic error message to prevent account enumeration
            const genericError = "Invalid email or password"

            if (!credentials?.email || !credentials?.password) {
                throw new Error(genericError)
            }

            const email = credentials.email.trim().toLowerCase()
            const password = credentials.password

            // Basic email pattern sanity check
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(email) || password.length > 72) {
                await bcrypt.compare(password, DUMMY_BCRYPT_HASH)
                throw new Error(genericError)
            }

            // Retrieve User ID mapped to email in Redis
            const userId = (await fetchRedis("get", `user:email:${email}`)) as string | null

            if (!userId) {
                // Neutralize timing attack: execute dummy hash comparison
                await bcrypt.compare(password, DUMMY_BCRYPT_HASH)
                throw new Error(genericError)
            }

            // Retrieve User profile from Redis
            const rawUser = (await fetchRedis("get", `user:${userId}`)) as string | User | null

            if (!rawUser) {
                await bcrypt.compare(password, DUMMY_BCRYPT_HASH)
                throw new Error(genericError)
            }

            const dbUser = (typeof rawUser === "string" ? JSON.parse(rawUser) : rawUser) as User

            // If account was created via OAuth without a local password
            if (!dbUser.password) {
                await bcrypt.compare(password, DUMMY_BCRYPT_HASH)
                throw new Error("This account was created with Google. Please use 'Sign in with Google'.")
            }

            // Verify password using bcrypt
            const isPasswordValid = await bcrypt.compare(password, dbUser.password)
            if (!isPasswordValid) {
                throw new Error(genericError)
            }

            // VAPT: Never expose password or internal metadata in returned user object
            return {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                image: dbUser.image
            }
        }
    })
]

// Conditionally enable Google Provider if environment variables are configured
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

if (googleClientId && googleClientSecret) {
    providers.push(
        GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret
        })
    )
}

export const authOptions: NextAuthOptions = {
    adapter: UpstashRedisAdapter(db),
    session: {
        strategy: "jwt"
    },
    secret: process.env.NEXTAUTH_SECRET,
    pages: {
        signIn: "/login",
        error: "/login"
    },
    providers,
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
                token.email = user.email
                token.name = user.name
                token.picture = user.image

                // Ensure user is indexed in global users set and username search indices
                db.sadd('users', user.id).catch(() => {})
                if (user.name) {
                    db.set(`user:name:${user.name.toLowerCase().trim()}`, user.id).catch(() => {})
                }
                return token
            }

            const dbUserResult = (await fetchRedis("get", `user:${token.id}`)) as string | User | null

            if (!dbUserResult) {
                return token
            }

            const dbUser = (typeof dbUserResult === "string" ? JSON.parse(dbUserResult) : dbUserResult) as User

            return {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                picture: dbUser.image
            }
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id
                session.user.email = token.email
                session.user.image = token.picture
                session.user.name = token.name
            }
            return session
        },
        redirect({ url, baseUrl }) {
            if (url.startsWith("/")) return `${baseUrl}${url}`
            if (new URL(url).origin === baseUrl) return url
            return `${baseUrl}/dashboard`
        }
    }
}
