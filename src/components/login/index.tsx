"use client"

import { Button } from '@/common'
import { googleIcon } from '@/images'
import { MessageCircleCode } from 'lucide-react'
import { signIn } from 'next-auth/react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface LoginProps {}

const Login: FC<LoginProps> = () => {
    const [isLoading, setIsLoading] = useState(false)
    const searchParams = useSearchParams()

    useEffect(() => {
        const error = searchParams.get('error')
        if (error) {
            toast.error(`Login failed: ${error}. Please try again.`)
        }
    }, [searchParams])

    async function loginWithGoogle() {
        setIsLoading(true)
        try {
            await signIn('google', { callbackUrl: '/dashboard' })
        } catch (error) {
            console.error(error)
            toast.error('Something went wrong with Google sign in')
            setIsLoading(false)
        }
    }

    return (
        <div className="flex items-center justify-center px-4 sm:px-6 lg:px-8 h-screen bg-gradient-to-tr from-blue-600 via-indigo-400 to-sky-300">
            <div className="w-full flex flex-col items-center max-w-md space-y-8 border py-8 px-6 bg-white/10 backdrop-blur-sm rounded-xl shadow-lg border-white/20">
                <div className="flex flex-col items-center gap-6">
                    <div className="flex gap-4 items-center">
                        <MessageCircleCode color="white" size={40} /> 
                        <h1 className="text-4xl font-bold text-white tracking-tight">
                            Chat+
                        </h1> 
                    </div>
                    <h2 className="text-center text-2xl font-bold tracking-tight text-white">
                        Sign in to your account
                    </h2>
                </div>
                <Button 
                    isLoading={isLoading} 
                    type="button" 
                    className="max-w-sm mx-auto w-full flex items-center justify-center gap-3 bg-white text-gray-900 hover:bg-gray-100" 
                    onClick={loginWithGoogle}
                >
                    {!isLoading && <Image src={googleIcon} alt="Google logo" width={20} height={20} />}
                    <span>Login with Google</span>
                </Button>
            </div>
        </div>
    )
}

export default Login
