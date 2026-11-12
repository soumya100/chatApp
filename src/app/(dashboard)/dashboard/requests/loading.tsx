import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'

const loading = () => { 
  return (
    <div className="w-full flex flex-col gap-3 p-5 sm:p-8 bg-white dark:bg-zinc-950">
        <Skeleton className="mb-4" height={50} width={300} />
        <Skeleton height={50} width="100%" borderRadius={12} className="max-w-md" />
        <Skeleton height={50} width="100%" borderRadius={12} className="max-w-md" />
        <Skeleton height={50} width="100%" borderRadius={12} className="max-w-md" />
    </div>
  )
}

export default loading
