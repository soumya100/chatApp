import Image from 'next/image'
import { FC } from 'react'
import Messages from './Messages'
import ChatInput from './ChatInput'


interface ChatProps {
  chatPartner: User
  initialMessages: Message[]
  sessionId: string
}

const Chat: FC<ChatProps> = ({chatPartner,initialMessages,sessionId}) => {
  return  <div className='flex flex-1 justify-between flex-col h-full max-h-[calc(100vh-6rem)]'>
  <div className="flex sm:items-center justify-between py-3 border-b-2 border-gray-200 px-5">
   <div className="relative flex items-center space-x-4">
     <div className="relative">
       <div className="relative w-8 sm:w-12 h-8 sm:h-12">
         <Image src={chatPartner.image} alt={`${chatPartner.name} profile Image`} fill
         referrerPolicy='no-referrer'
         className='rounded-full'
         />
       </div>
     </div>
    <div className="flex flex-col leading-tight">
        <div className='text-xl flex items-center'>
            <span className='text-gray-700 mr-3 font-semibold'>
                {chatPartner.name}
            </span>
        </div>
        <div className="text-sm text-gray-600">
            {chatPartner.email}
        </div>
    </div>
   </div>
  </div>
  <Messages initialMessages={initialMessages} sessionId={sessionId}/>
  <ChatInput />
 </div>
}

export default Chat