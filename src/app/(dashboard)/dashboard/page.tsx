import Button from '@/common/Button'
import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'

interface pageProps {
  
}

const page= async({}) => {
  
  const session= await getServerSession(authOptions)
  return <p>
    {/* {JSON.stringify(session)} */}
  </p>
}

export default page