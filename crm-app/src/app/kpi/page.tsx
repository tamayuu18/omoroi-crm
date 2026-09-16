import { getAppSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { KpiClient } from '@/components/KpiClient'

export const dynamic = 'force-dynamic'

export default async function KpiPage() {
  const session = await getAppSession()
  if (!session) redirect('/auth/signin')

  return <KpiClient />
}
