import { Button } from '@/common'
import axios from 'axios'
import { ChangeEvent, FC, KeyboardEvent, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import TextareaAutosize from 'react-textarea-autosize'

interface ChatInputProps {
  chatPartner: string,
  chatId: string
}

const ChatInput: FC<ChatInputProps> = ({chatPartner, chatId}) => {
const textAreaRef= useRef<HTMLTextAreaElement | null>(null)
const [input, setInput]= useState<string>('')
const[isLoading, setIsLoading]=useState<boolean>(false)


//handle change function for text area
const handleInputChange=(e: ChangeEvent<HTMLTextAreaElement>)=>{
  setInput(e.target.value)
}


//send message function use to trigger the send message
const sendMessage=async()=>{
  setIsLoading(true)
  try {
    if(input.trim().length > 1){
     await axios.post('/api/message/send', {
        text: input,
        chatId
      })
    // await new Promise((resolve)=> setTimeout(resolve, 1000))
      setInput('')
      textAreaRef.current?.focus()
    }
  } catch (error) {
    toast.error('Something went wrong. Please try later')
  }finally{
    setIsLoading(false)
  }
}

//enter press function gives us what will happen if someone presses enter
const enterPress=(e: KeyboardEvent<HTMLTextAreaElement>)=>{
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault()
    sendMessage()
  }
}



  return <div className='border-t border-gray-200 px-4 pt-4 mb-2 sm:md-0'>
    <div className="relative flex-1 overflow-hidden rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-indigo-600 ">
        <TextareaAutosize autoFocus onKeyDown={enterPress} 
        ref={textAreaRef}
        rows={1}
        value={input}
        onChange={handleInputChange}
        placeholder={`Message ${chatPartner}`}
        className='block w-full h-full resize-none border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:py-1.5 py:leading-6 sm:text-sm '
        />
        <div onClick={()=>textAreaRef.current?.focus()} className='py-2' aria-hidden >
          <div className="py-px">
            <div className='h-9'/>
          </div>
        </div>
        <div className="absolute right-0 bottom-0 flex justify-between py-2 pl-3 pr-2">
          <div className='flex-shrink-0 '>
            <Button onClick={sendMessage} type='submit' isLoading={isLoading}>Post</Button>
          </div>
        </div>
    </div>
  </div>
}

export default ChatInput