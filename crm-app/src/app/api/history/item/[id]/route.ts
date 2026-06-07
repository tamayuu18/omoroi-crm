import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCustomer } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const body = await request.json()
    if (body.date && typeof body.date === 'string') body.date = new Date(body.date)
    if (body.nextDeadline && typeof body.nextDeadline === 'string') body.nextDeadline = new Date(body.nextDeadline)
    if (body.nextDeadline === '') body.nextDeadline = null
    const history = await prisma.history.update({ where: { id }, data: body })
    // 顧客の次回アクション・期限も同期
    if (history.customerId && (body.nextContent !== undefined || body.nextDeadline !== undefined)) {
      await updateCustomer(history.customerId, {
        nextAction: history.nextContent || undefined,
        nextDeadline: history.nextDeadline || undefined,
      })
    }
    return Response.json(history)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update history' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    await prisma.history.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to delete history' }, { status: 500 })
  }
}
