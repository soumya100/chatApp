import { FC } from 'react'

interface NoContentProps {
  noContentText?: string,
  className?: string
}

const NoContent: FC<NoContentProps> = ({noContentText, className}) => {
  return <div className={`h-full w-full flex items-center justify-center ${className}`}>
    <p className='text-zinc-500 text-2xl'>
    { noContentText ?? `No Content Found`}
   </p>
  </div>
}

export default NoContent