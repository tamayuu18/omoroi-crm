import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { CustomerListClient } from '@/components/CustomerListClient'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')

  return <CustomerListClient />
}
