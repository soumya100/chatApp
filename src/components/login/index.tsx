"use client"

import { googleIcon } from '@/images'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, MessageCircleCode, ShieldCheck } from 'lucide-react'
import { signIn } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FC, FormEvent, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface LoginProps {}

const Login: FC<LoginProps> = () => {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [isCredentialsLoading, setIsCredentialsLoading] = useState(false)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        const error = searchParams.get('error')
        if (error) {
            if (error === 'CredentialsSignin') {
                setErrorMessage('Invalid email or password. Please try again.')
            } else {
                setErrorMessage(`Authentication error: ${error}. Please try again.`)
            }
        }
    }, [searchParams])

    async function handleCredentialsLogin(e: FormEvent) {
        e.preventDefault()
        setErrorMessage(null)

        if (!email.trim() || !password) {
            setErrorMessage('Please enter both email and password.')
            return
        }

        setIsCredentialsLoading(true)
        try {
            const result = await signIn('credentials', {
                email: email.trim().toLowerCase(),
                password,
                redirect: false
            })

            if (!result) {
                setErrorMessage('Unable to connect to authentication server.')
                setIsCredentialsLoading(false)
                return
            }

            if (result.error) {
                setErrorMessage(result.error)
                toast.error(result.error)
                setIsCredentialsLoading(false)
                return
            }

            toast.success('Welcome back!')
            window.location.href = '/dashboard'
        } catch (error) {
            console.error('Credentials login error:', error)
            setErrorMessage('An unexpected error occurred. Please try again.')
            toast.error('Something went wrong. Please try again.')
            setIsCredentialsLoading(false)
        }
    }

    async function loginWithGoogle() {
        setErrorMessage(null)
        setIsGoogleLoading(true)
        try {
            await signIn('google', { callbackUrl: '/dashboard' })
        } catch (error) {
            console.error('Google sign in error:', error)
            toast.error('Something went wrong with Google sign in')
            setIsGoogleLoading(false)
        }
    }

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
            {/* Ambient Aurora Glow Background */}
            <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] pointer-events-none" />
            <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-violet-600/20 rounded-full blur-[128px] pointer-events-none" />
            <div className="absolute -top-24 right-1/4 w-80 h-80 bg-sky-500/10 rounded-full blur-[100px] pointer-events-none" />

            {/* Subtle Grid Pattern Overlay */}
            <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                    backgroundSize: '32px 32px'
                }}
            />

            {/* Main Auth Container */}
            <div className="relative w-full max-w-md">
                {/* Glow ring surrounding card */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-3xl blur-xl opacity-20 transition duration-1000 group-hover:opacity-30" />

                <div className="relative bg-slate-900/70 border border-slate-800/80 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
                    {/* Header with App Branding */}
                    <div className="flex flex-col items-center text-center space-y-3">
                        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
                            <MessageCircleCode className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                                Welcome to Chat+
                            </h1>
                            <p className="text-sm text-slate-400 mt-1">
                                Secure, instant, real-time messaging
                            </p>
                        </div>
                    </div>

                    {/* VAPT Security Verified Pill */}
                    <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-full bg-indigo-950/40 border border-indigo-800/40 text-indigo-300 text-xs font-medium w-fit mx-auto">
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                        <span>VAPT Hardened &bull; End-to-End Secure</span>
                    </div>

                    {/* Error Banner */}
                    {errorMessage && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200 text-xs animate-in fade-in duration-200">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Credentials Login Form */}
                    <form onSubmit={handleCredentialsLogin} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-medium text-slate-300">
                                Email Address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                    <Mail className="h-4 w-4" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition duration-150"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-medium text-slate-300">
                                    Password
                                </label>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                    <Lock className="h-4 w-4" />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition duration-150"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition"
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isCredentialsLoading || isGoogleLoading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] shadow-lg shadow-indigo-600/25 disabled:opacity-60 disabled:cursor-not-allowed transition duration-150 cursor-pointer"
                        >
                            {isCredentialsLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Authenticating...</span>
                                </>
                            ) : (
                                <span>Sign In with Password</span>
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-800" />
                        </div>
                        <span className="relative px-3 bg-slate-900/90 text-slate-400 text-xs uppercase tracking-wider font-medium">
                            Or continue with
                        </span>
                    </div>

                    {/* Google OAuth Login Button */}
                    <button
                        type="button"
                        onClick={loginWithGoogle}
                        disabled={isGoogleLoading || isCredentialsLoading}
                        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl text-sm font-medium text-slate-200 bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 active:scale-[0.98] shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition duration-150 cursor-pointer"
                    >
                        {isGoogleLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                        ) : (
                            <Image src={googleIcon} alt="Google logo" width={18} height={18} />
                        )}
                        <span>Sign In with Google</span>
                    </button>

                    {/* Navigation Link to Signup */}
                    <div className="text-center pt-2">
                        <p className="text-xs text-slate-400">
                            Don&apos;t have an account?{' '}
                            <Link
                                href="/signup"
                                className="font-semibold text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition"
                            >
                                Create an account
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Login
