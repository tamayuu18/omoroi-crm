export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMeetings, createMeeting } from '@/lib/db'

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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.customerId || !body.date) return Response.json({ error: 'customerId and date required' }, { status: 400 })
    const meeting = await createMeeting({
      customerId: body.customerId,
      name: body.name ?? '',
      ca: body.ca ?? '',
      date: new Date(body.date),
      startTime: body.startTime || null,
      endTime: body.endTime || null,
      method: body.method || null,
      status: body.status || '予約済',
      remind: null,
      result: null,
      temp: null,
      proposal: null,
      nextAction: null,
      nextDeadline: null,
    })
    return Response.json(meeting, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to create meeting' }, { status: 500 })
  }
}
