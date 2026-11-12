import { FC } from 'react'

interface NoContentProps {
  noContentText?: string,
  className?: string
}

const NoContent: FC<NoContentProps> = ({ noContentText, className }) => {
  return (
    <div className={`h-full w-full flex items-center justify-center p-8 text-center ${className || ''}`}>
      <p className='text-zinc-400 dark:text-zinc-500 text-xl font-medium'>
        {noContentText ?? `No Content Found`}
      </p>
    </div>
  )
}

export default NoContent
