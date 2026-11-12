import { getToken } from "next-auth/jwt"
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
    async function middleware(req) {
        const pathname = req.nextUrl.pathname

        const isAuth = await getToken({ req })
        const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup')

        const sensitiveRoutes = ['/dashboard']
        const isAccessingSensitiveRoute = sensitiveRoutes.some((route) => pathname.startsWith(route))

        // If authenticated user visits login or signup, redirect them straight to dashboard
        if (isAuthPage) {
            if (isAuth) {
                return NextResponse.redirect(new URL('/dashboard', req.url))
            }
            return NextResponse.next()
        }

        // If unauthenticated user tries to access sensitive dashboard routes, redirect to login
        if (!isAuth && isAccessingSensitiveRoute) {
            return NextResponse.redirect(new URL('/login', req.url))
        }

        // Root route handler
        if (pathname === '/') {
            if (isAuth) {
                return NextResponse.redirect(new URL('/dashboard', req.url))
            }
            return NextResponse.redirect(new URL('/login', req.url))
        }
    },
    {
        callbacks: {
            async authorized() {
                return true
            },
        },
    }
)

export const config = {
    matcher: ['/', '/login', '/signup', '/dashboard/:path*']
}
