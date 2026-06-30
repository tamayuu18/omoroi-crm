import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { JobsClient } from '@/components/JobsClient'

export const dynamic = 'force-dynamic'

export default async function JobsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')

  return <JobsClient />
}
