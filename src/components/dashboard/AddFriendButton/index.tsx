"use client"
import { Button } from '@/common'
import { addFriendValidator } from '@/lib/validations/add-friends'
import { zodResolver } from '@hookform/resolvers/zod'
import axios, { AxiosError } from 'axios'
import { FC } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { z } from 'zod'

interface AddFriendProps { 
  closeModalHandler(): void
}

type FormData = z.infer<typeof addFriendValidator>

const AddFriendButton: FC<AddFriendProps> = ({ closeModalHandler }) => {

  const {
    register,
    handleSubmit,
    setError,
    formState:{errors}
  } = useForm<FormData>({
    resolver: zodResolver(addFriendValidator)
  })

  const addFriend = async (email: string) => {
    try {
      const validatedEmail = addFriendValidator.parse({ email })

      await axios.post('/api/friends/add', {
        email: validatedEmail,
      })
      closeModalHandler()
      toast.success('Friend request sent successfully')
    } catch (error) {
      if (error instanceof z.ZodError) {
        setError('email', {message: error.message})
        return
      }

      if (error instanceof AxiosError) {
        setError('email', {message: error.response?.data})
        return
      }

      setError('email', {message: 'Something went wrong...'})
    }
  }

  const onSubmit=(data: FormData)=>{
    addFriend(data.email)
  }

  return <main className='px-5 w-full'>
     <h1 className="font-bold text-2xl mb-4">
        Add a friend
    </h1>
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm">
    <label htmlFor="email" className='block text-sm font-medium leading-6 text-grey-900'>
      Add friend by E-mail
    </label>
    <div className="mt-2 flex gap-4">
      <input
        {...register('email')}
        type="text"
        placeholder='you@example.com'
        className="block w-full rounded-md border-0 py-1 5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
      <Button>Add</Button>
    </div>
    <small className='mt-1 text-xs text-red-600'>{errors.email?.message}</small>
  </form>
    </main>
}

export default AddFriendButton