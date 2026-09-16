import { getAppSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { TasksClient } from '@/components/TasksClient'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const session = await getAppSession()
  if (!session) redirect('/auth/signin')

  return <TasksClient />
}
