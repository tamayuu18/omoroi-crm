import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { CustomerDetailClient } from '@/components/CustomerDetailClient'

export const dynamic = 'force-dynamic'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')

  const { id } = await params
  return <CustomerDetailClient customerId={id} />
}
