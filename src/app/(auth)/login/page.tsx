import Login from "@/components/login"
import { FC, Suspense } from "react"
import { Loader2 } from "lucide-react"

interface LoginProps {}

const LoginPage: FC<LoginProps> = () => {   
    return (
        <Suspense fallback={
            <div className="flex h-screen w-full items-center justify-center bg-gradient-to-tr from-blue-600 via-indigo-400 to-sky-300">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
        }>
            <Login />
        </Suspense>
    )
}

export default LoginPage
