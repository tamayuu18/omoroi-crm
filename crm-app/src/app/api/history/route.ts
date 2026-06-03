import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addHistory } from '@/lib/db'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    // Convert date string to Date object if provided as string
    if (body.date && typeof body.date === 'string') {
      body.date = new Date(body.date)
    }
    if (body.nextDeadline && typeof body.nextDeadline === 'string') {
      body.nextDeadline = new Date(body.nextDeadline)
    }
    const history = await addHistory(body)
    return Response.json(history, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to add history' }, { status: 500 })
  }
}
