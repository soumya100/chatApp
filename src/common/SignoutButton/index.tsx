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

  return (
    <Button
      {...props}
      variant={'ghost'}
      onClick={logoutFunction}
      isLoading={isSignOut}
      aria-label={props['aria-label'] || 'Sign out of your account'}
      title='Sign out'
    >
      <LogOut className='w-4 h-4' aria-hidden='true' />
    </Button>
  )
}

export default SignOutButton