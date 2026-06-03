import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTasks } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const params = request.nextUrl.searchParams
    const customerId = params.get('customerId') ?? undefined
    const ca = params.get('ca') ?? undefined
    const tasks = await getTasks({ customerId, ca })
    return Response.json(tasks)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}
