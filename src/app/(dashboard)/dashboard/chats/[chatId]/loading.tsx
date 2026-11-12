import Skeleton from "react-loading-skeleton"
import 'react-loading-skeleton/dist/skeleton.css'

const loading = () => {
  return (
    <div className='flex flex-col h-full items-center bg-white dark:bg-zinc-950 p-4'>
      <Skeleton className='mb-4' height={40} width={300} />
      {/* chat messages */}
      <div className='flex-1 max-h-full overflow-y-scroll w-full'>
        <div className='flex flex-col flex-auto h-full p-4 sm:p-6'>
          <div className='flex flex-col flex-auto flex-shrink-0 rounded-2xl bg-gray-50 dark:bg-zinc-900/60 h-full p-4 border border-gray-100 dark:border-zinc-800/60'>
            <div className='flex flex-col h-full overflow-x-auto mb-4'>
              <div className='flex flex-col h-full'>
                <div className='grid grid-cols-12 gap-y-3'>
                  {/* Partner message */}
                  <div className='col-start-6 col-end-13 p-2 rounded-lg'>
                    <div className='flex items-center justify-start flex-row-reverse'>
                      <div className='relative h-10 w-10 shrink-0'>
                        <Skeleton width={40} height={40} borderRadius={999} />
                      </div>
                      <div className='relative mr-3 text-sm bg-indigo-50 dark:bg-indigo-950/40 py-2 px-4 border border-indigo-100 dark:border-indigo-900/50 rounded-xl'>
                        <Skeleton width={140} height={20} />
                      </div>
                    </div>
                  </div>

                  <div className='col-start-6 col-end-13 p-2 rounded-lg'>
                    <div className='flex items-center justify-start flex-row-reverse'>
                      <div className='relative h-10 w-10 shrink-0'>
                        <Skeleton width={40} height={40} borderRadius={999} />
                      </div>
                      <div className='relative mr-3 text-sm bg-indigo-50 dark:bg-indigo-950/40 py-2 px-4 border border-indigo-100 dark:border-indigo-900/50 rounded-xl'>
                        <Skeleton width={180} height={20} />
                      </div>
                    </div>
                  </div>

                  {/* My message */}
                  <div className='col-start-1 col-end-8 p-2 rounded-lg'>
                    <div className='flex flex-row items-center'>
                      <div className='relative h-10 w-10 shrink-0'>
                        <Skeleton width={40} height={40} borderRadius={999} />
                      </div>
                      <div className='relative ml-3 text-sm bg-white dark:bg-zinc-800 py-2 px-4 border border-gray-200 dark:border-zinc-700 rounded-xl'>
                        <Skeleton width={150} height={20} />
                      </div>
                    </div>
                  </div>

                  <div className='col-start-6 col-end-13 p-2 rounded-lg'>
                    <div className='flex items-center justify-start flex-row-reverse'>
                      <div className='relative h-10 w-10 shrink-0'>
                        <Skeleton width={40} height={40} borderRadius={999} />
                      </div>
                      <div className='relative mr-3 text-sm bg-indigo-50 dark:bg-indigo-950/40 py-2 px-4 border border-indigo-100 dark:border-indigo-900/50 rounded-xl'>
                        <Skeleton width={120} height={20} />
                      </div>
                    </div>
                  </div>

                  <div className='col-start-1 col-end-8 p-2 rounded-lg'>
                    <div className='flex flex-row items-center'>
                      <div className='relative h-10 w-10 shrink-0'>
                        <Skeleton width={40} height={40} borderRadius={999} />
                      </div>
                      <div className='relative ml-3 text-sm bg-white dark:bg-zinc-800 py-2 px-4 border border-gray-200 dark:border-zinc-700 rounded-xl'>
                        <Skeleton width={160} height={20} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default loading
