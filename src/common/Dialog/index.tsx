"use client"
import { X } from 'lucide-react'
import { DialogHTMLAttributes, FC, KeyboardEvent, ReactNode, useEffect, useLayoutEffect, useRef } from 'react'

interface DialogProps extends DialogHTMLAttributes<HTMLDialogElement> {
  children: ReactNode,
  closeHandler(): void
}

const Dialog: FC<DialogProps> = ({ children, className, open, onClick, closeHandler, title, ...props }) => {

  const dialogRef = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    if (dialogRef.current && open=== true)
      dialogRef.current.showModal()
  }, [open])

  useEffect(() => {
    if (dialogRef.current && open === false)
      dialogRef.current.close();
  }, [open]);

  const onEscPress=(e: KeyboardEvent<HTMLDialogElement>)=>{
    if(e.key.toLowerCase()==='escape'){
      closeHandler()
    }
  }

  return open && <dialog className={className} ref={dialogRef} onKeyDown={onEscPress} {...props}>
    <div className='flex justify-end w-full pr-3'>
      <X onClick={closeHandler} className='cursor-pointer text-red-500' size={20} />
    </div>
    {children}
  </dialog>

}

export default Dialog