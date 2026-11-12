"use client"

import { googleIcon } from '@/images'
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    MessageCircleCode,
    ShieldCheck,
    User,
    X
} from 'lucide-react'
import { signIn } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FC, FormEvent, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

interface SignupProps {}

const Signup: FC<SignupProps> = () => {
    const router = useRouter()

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    const [isLoading, setIsLoading] = useState(false)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // Password criteria assessment for VAPT compliance & real-time strength meter
    const passwordChecks = useMemo(() => {
        return {
            minLength: password.length >= 8,
            hasUpper: /[A-Z]/.test(password),
            hasLower: /[a-z]/.test(password),
            hasNumber: /[0-9]/.test(password),
            hasSpecial: /[^A-Za-z0-9]/.test(password),
        }
    }, [password])

    const strengthScore = useMemo(() => {
        let score = 0
        if (passwordChecks.minLength) score += 1
        if (passwordChecks.hasUpper && passwordChecks.hasLower) score += 1
        if (passwordChecks.hasNumber) score += 1
        if (passwordChecks.hasSpecial) score += 1
        return score
    }, [passwordChecks])

    const strengthLabel = useMemo(() => {
        if (!password) return { text: '', color: 'bg-slate-700' }
        if (strengthScore <= 1) return { text: 'Weak', color: 'bg-red-500' }
        if (strengthScore === 2) return { text: 'Fair', color: 'bg-amber-500' }
        if (strengthScore === 3) return { text: 'Good', color: 'bg-blue-500' }
        return { text: 'Strong (VAPT Compliant)', color: 'bg-emerald-500' }
    }, [password, strengthScore])

    async function handleSignup(e: FormEvent) {
        e.preventDefault()
        setErrorMessage(null)

        if (!name.trim()) {
            setErrorMessage('Please enter your full name.')
            return
        }

        if (!email.trim()) {
            setErrorMessage('Please enter a valid email address.')
            return
        }

        if (strengthScore < 4) {
            setErrorMessage('Password does not satisfy the security requirements below.')
            return
        }

        if (password !== confirmPassword) {
            setErrorMessage('Passwords do not match.')
            return
        }

        setIsLoading(true)

        try {
            // Send registration request to VAPT-hardened endpoint
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim().toLowerCase(),
                    password,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setErrorMessage(data.message || 'Registration failed. Please try again.')
                toast.error(data.message || 'Registration failed')
                setIsLoading(false)
                return
            }

            toast.success('Account created! Signing you in...')

            // Automatically sign in the user for a smooth onboarding experience
            const loginRes = await signIn('credentials', {
                email: email.trim().toLowerCase(),
                password,
                redirect: false,
            })

            if (loginRes?.ok && !loginRes?.error) {
                toast.success('Welcome to Chat+!')
                // Force top-level document navigation so cookies are committed immediately
                window.location.href = '/dashboard'
            } else {
                toast.success('Account created! Please sign in.')
                window.location.href = '/login?registered=true'
            }
        } catch (error) {
            console.error('Signup error:', error)
            setErrorMessage('Unable to connect to the server. Please try again.')
            toast.error('Network error during signup')
            setIsLoading(false)
        }
    }

    async function signupWithGoogle() {
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
        <div className="relative min-h-screen w-full flex items-center justify-center p-4 py-8 bg-slate-950 overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
            {/* Ambient Aurora Glow Background */}
            <div className="absolute top-1/4 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] pointer-events-none" />
            <div className="absolute bottom-1/4 -left-32 w-96 h-96 bg-violet-600/20 rounded-full blur-[128px] pointer-events-none" />

            {/* Subtle Grid Pattern Overlay */}
            <div
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                    backgroundSize: '32px 32px',
                }}
            />

            {/* Main Signup Card */}
            <div className="relative w-full max-w-md my-4">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-indigo-500 rounded-3xl blur-xl opacity-20 transition duration-1000" />

                <div className="relative bg-slate-900/70 border border-slate-800/80 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
                    {/* Header */}
                    <div className="flex flex-col items-center text-center space-y-3">
                        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
                            <MessageCircleCode className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                                Create an Account
                            </h1>
                            <p className="text-sm text-slate-400 mt-1">
                                Join Chat+ for fast, real-time messaging
                            </p>
                        </div>
                    </div>

                    {/* VAPT Security Verified Pill */}
                    <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-full bg-indigo-950/40 border border-indigo-800/40 text-indigo-300 text-xs font-medium w-fit mx-auto">
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Bcrypt Salt Work 12 &bull; Rate-Limited &bull; VAPT Verified</span>
                    </div>

                    {/* Error Alert */}
                    {errorMessage && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200 text-xs animate-in fade-in duration-200">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSignup} className="space-y-4">
                        {/* Name */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-medium text-slate-300">
                                Full Name
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                    <User className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your Name"
                                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition duration-150"
                                />
                            </div>
                        </div>

                        {/* Email */}
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

                        {/* Password */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-medium text-slate-300">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                    <Lock className="h-4 w-4" />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Create a strong password"
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

                            {/* Password Strength Meter */}
                            {password && (
                                <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400">Password strength:</span>
                                        <span className="font-medium text-slate-200">{strengthLabel.text}</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1.5 h-1.5">
                                        {[1, 2, 3, 4].map((step) => (
                                            <div
                                                key={step}
                                                className={`rounded-full transition-colors duration-300 ${
                                                    strengthScore >= step ? strengthLabel.color : 'bg-slate-800'
                                                }`}
                                            />
                                        ))}
                                    </div>

                                    {/* Security Requirements Checklist */}
                                    <div className="grid grid-cols-2 gap-1 text-[11px] pt-1">
                                        <div className={`flex items-center gap-1.5 ${passwordChecks.minLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            {passwordChecks.minLength ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                            <span>8+ characters</span>
                                        </div>
                                        <div className={`flex items-center gap-1.5 ${passwordChecks.hasUpper && passwordChecks.hasLower ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            {passwordChecks.hasUpper && passwordChecks.hasLower ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                            <span>Upper & lower case</span>
                                        </div>
                                        <div className={`flex items-center gap-1.5 ${passwordChecks.hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            {passwordChecks.hasNumber ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                            <span>At least 1 number</span>
                                        </div>
                                        <div className={`flex items-center gap-1.5 ${passwordChecks.hasSpecial ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            {passwordChecks.hasSpecial ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                            <span>Special symbol</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-medium text-slate-300">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                    <Lock className="h-4 w-4" />
                                </div>
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    required
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter your password"
                                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition duration-150"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition"
                                    tabIndex={-1}
                                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showConfirmPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                            {confirmPassword && password !== confirmPassword && (
                                <p className="text-[11px] text-red-400 pt-0.5">Passwords do not match</p>
                            )}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading || isGoogleLoading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] shadow-lg shadow-indigo-600/25 disabled:opacity-60 disabled:cursor-not-allowed transition duration-150 cursor-pointer mt-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Creating Account...</span>
                                </>
                            ) : (
                                <span>Create Account</span>
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

                    {/* Google OAuth Button */}
                    <button
                        type="button"
                        onClick={signupWithGoogle}
                        disabled={isGoogleLoading || isLoading}
                        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl text-sm font-medium text-slate-200 bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 active:scale-[0.98] shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition duration-150 cursor-pointer"
                    >
                        {isGoogleLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                        ) : (
                            <Image src={googleIcon} alt="Google logo" width={18} height={18} />
                        )}
                        <span>Sign Up with Google</span>
                    </button>

                    {/* Navigation Link to Login */}
                    <div className="text-center pt-2">
                        <p className="text-xs text-slate-400">
                            Already have an account?{' '}
                            <Link
                                href="/login"
                                className="font-semibold text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition"
                            >
                                Sign in
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Signup

