export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addHistory, updateCustomer } from '@/lib/db'

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
    body.createdBy = session.user?.name ?? null
    const history = await addHistory(body)
    // 次回アクション・期限を顧客レコードにも反映
    if (body.customerId && (body.nextContent || body.nextDeadline)) {
      await updateCustomer(body.customerId, {
        nextAction: body.nextContent || undefined,
        nextDeadline: body.nextDeadline || undefined,
        lastContact: body.date || new Date(),
      })
    } else if (body.customerId) {
      await updateCustomer(body.customerId, { lastContact: body.date || new Date() })
    }
    return Response.json(history, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to add history' }, { status: 500 })
  }
}
