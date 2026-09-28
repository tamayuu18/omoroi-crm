import { getAppSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { DashboardClient } from '@/components/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getAppSession()
  if (!session) redirect('/auth/signin')

  return <DashboardClient />
}
