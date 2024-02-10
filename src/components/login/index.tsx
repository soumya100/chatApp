"use client"

import { Button } from '@/common'
import { googleIcon } from '@/images'
import { MessageCircleCode } from 'lucide-react'
import { signIn } from 'next-auth/react'
import Image from 'next/image'
import { FC, useState } from 'react'
import toast from 'react-hot-toast'

interface LoginProps {
  
}

const Login: FC<LoginProps> = ({}) => {

    const [isLoading, setIsLoading]= useState(false)

    async function loginWithGoogle(){
        setIsLoading(true)
        try{
            await signIn('google')
            toast.success('User Logged in Successfully')
        }catch(error){
            console.error(error)
            toast.error('Something went wrong')
        }finally{
            setIsLoading(false)
        }
    }
 

  return (<div className={`flex items-center justify-center px-4 sm:px-6 lg:px-8 h-screen bg-gradient-to-tr from-blue-600 via-indigo-400 to-sky-300`}>
  <div className="w-full flex flex-col items-center max-w-md space-y-8 border py-5 rounded-lg shadow-md">
      <div className='flex flex-col items-center gap-8'>
          <div className='flex gap-5 items-center'>
          <MessageCircleCode color='white' size={40}/> 
         <h1 className='!text-4xl font-bold !text-white'>
        Chat+
        </h1> 
          </div>
          <h2 className='mt-6 text-center text-3xl font-bold tracking-tight text-gray-900'>
              Sign in to your account
          </h2>
      </div>
      <Button isLoading={isLoading} type='button' className='max-w-sm mx-auto w-full' onClick={loginWithGoogle}>
         {!isLoading && <Image src={googleIcon} alt={`login with google`} />}&nbsp;
          Login with google
      </Button>
  </div>
</div>
)}

export default Login