import Signup from "@/components/signup"
import { FC, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Create an Account – Chat+",
    description: "Sign up for Chat+ to start real-time messaging with your friends.",
}

interface SignupPageProps {}

const SignupPage: FC<SignupPageProps> = () => {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen w-full items-center justify-center bg-slate-950">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        }>
            <Signup />
        </Suspense>
    )
}

export default SignupPage

