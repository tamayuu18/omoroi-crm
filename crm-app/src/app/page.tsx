import { redirect } from 'next/navigation'
import { getAppSession } from '@/lib/session'

export default async function HomePage() {
  const session = await getAppSession()
  if (!session) redirect('/auth/signin')
  redirect('/customers')
}
