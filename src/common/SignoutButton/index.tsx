"use client"

import { ButtonHTMLAttributes, FC, useState } from 'react'
import { Button } from '..'
import { signOut } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Loader2, LogOut } from 'lucide-react'

interface SignOutButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>{}

const SignOutButton: FC<SignOutButtonProps> = ({...props}) => {

    const [isSignOut, setIsSignOut]=useState<boolean>(false)

    const logoutFunction=async()=>{
      setIsSignOut(true)
      try {
        await signOut()
        toast.success('Signed out successfully')
      } catch (error) {
        toast.error('Something went wrong with sign out')
      }finally{
        setIsSignOut(false)
      }
    }

  return <Button {...props} variant={'ghost'} onClick={logoutFunction}>
   {isSignOut ? <Loader2 className='animate-spin h-4 w-4' /> : <LogOut className='w-4 h-4' />}
  </Button>
}

export default SignOutButton