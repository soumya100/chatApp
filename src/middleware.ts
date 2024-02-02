//middlewares 

import { getToken } from "next-auth/jwt"
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
    async function middleware(req) {
        const pathname= req.nextUrl.pathname


        //managing routes protections
            const isAuth= await getToken({req})
            const isLoginPage= pathname.startsWith('/login')

        //sensitive routes 
            const sensitiveRoutes= ['/dashboard']

        //checking if the sensitive route is accessed
        const isAccessingSensitiveRoute= sensitiveRoutes.some((route)=> pathname.startsWith(route))

        //checking if the user is in login page
        if(isLoginPage){
            if(isAuth){    //if he/she is authenticated
                return NextResponse.redirect(new URL('/dashboard', req.url))  //redirecting to dashboard
            }

            return NextResponse.next()   //else the it will be as it is in login page
        }


        //checking if they are not authenticated and accessing the sensitive routes
        if(!isAuth && isAccessingSensitiveRoute){
            return NextResponse.redirect(new URL('/login', req.url)) //redirecting them to login page
        }


        //checking if they are in home page
        if(pathname === '/'){
            return NextResponse.redirect(new URL('/login', req.url)) //redirecting them to login page
        }
    },{
        callbacks:{
            async authorized(){
                return true
            },
        },
    })

// export const config= {
//     matcher: ['/', 'login', /^\/dashboard(\/.*)?$/]
// }