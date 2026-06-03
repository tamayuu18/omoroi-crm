import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMeetings } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const params = request.nextUrl.searchParams
    const customerId = params.get('customerId') ?? undefined
    const meetings = await getMeetings({ customerId })
    return Response.json(meetings)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch meetings' }, { status: 500 })
  }
}
