import { getAppSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { CustomerDetailClient } from '@/components/CustomerDetailClient'

export const dynamic = 'force-dynamic'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getAppSession()
  if (!session) redirect('/auth/signin')

  const { id } = await params
  return <CustomerDetailClient customerId={id} />
}
