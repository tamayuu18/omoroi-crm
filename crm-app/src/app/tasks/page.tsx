import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TasksClient } from '@/components/TasksClient'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/signin')

  return <TasksClient />
}
