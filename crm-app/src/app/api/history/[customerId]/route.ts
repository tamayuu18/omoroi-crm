import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getHistory } from '@/lib/sheets'

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/history/[customerId]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { customerId } = await ctx.params
  try {
    const history = await getHistory(customerId)
    return Response.json(history)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
