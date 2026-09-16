import { getAppSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { JobsClient } from '@/components/JobsClient'

export const dynamic = 'force-dynamic'

export default async function JobsPage() {
  const session = await getAppSession()
  if (!session) redirect('/auth/signin')

  return <JobsClient />
}
