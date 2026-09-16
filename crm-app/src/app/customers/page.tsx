import { getAppSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { CustomerListClient } from '@/components/CustomerListClient'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const session = await getAppSession()
  if (!session) redirect('/auth/signin')

  return <CustomerListClient />
}
