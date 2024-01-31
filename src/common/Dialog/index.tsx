import { X } from 'lucide-react'
import { DialogHTMLAttributes, FC, ReactNode } from 'react'

interface DialogProps extends DialogHTMLAttributes<HTMLDialogElement> {
  children: ReactNode,
  closeHandler(): void
}

const Dialog: FC<DialogProps> = ({ children, className, open, onClick,closeHandler, title, ...props }) => {
  return <dialog className={`${className} dialog`} open={open} onClick={onClick} {...props}>
    <div className='flex justify-end w-full pr-3'>
      <X onClick={closeHandler} className='cursor-pointer text-red-500' size={20}/>
    </div>
    {children}
  </dialog>

}

export default Dialog