import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addHistory } from '@/lib/sheets'
import type { History } from '@/types'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as Omit<History, 'id'>
    await addHistory(body)
    return Response.json({ success: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to add history' }, { status: 500 })
  }
}
