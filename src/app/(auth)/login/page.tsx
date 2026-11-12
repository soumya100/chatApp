import Login from "@/components/login"
import { FC, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Sign In",
    description: "Sign in to Chat+ to access your conversations, group chats, and real-time voice notes.",
}

interface LoginProps {}

const LoginPage: FC<LoginProps> = () => {   
    return (
        <Suspense fallback={
            <div className="flex min-h-screen w-full items-center justify-center bg-slate-950">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        }>
            <Login />
        </Suspense>
    )
}

export default LoginPage
