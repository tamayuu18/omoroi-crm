import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PRE_INTERVIEW_STATUSES } from '@/lib/db'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { ids, action, status } = await request.json() as { ids: string[]; action: 'delete' | 'updateStatus'; status?: string }
    if (!ids?.length) return Response.json({ error: 'no ids' }, { status: 400 })

    if (action === 'delete') {
      await prisma.history.deleteMany({ where: { customerId: { in: ids } } })
      await prisma.meeting.deleteMany({ where: { customerId: { in: ids } } })
      await prisma.task.deleteMany({ where: { customerId: { in: ids } } })
      await prisma.customer.deleteMany({ where: { id: { in: ids } } })
      return Response.json({ ok: true, deleted: ids.length })
    }

    if (action === 'updateStatus' && status) {
      await prisma.customer.updateMany({ where: { id: { in: ids } }, data: { status } })
      if (!PRE_INTERVIEW_STATUSES.includes(status)) {
        for (const id of ids) {
          const meeting = await prisma.meeting.findFirst({
            where: { customerId: id, status: { notIn: ['キャンセル', '完了'] } },
            orderBy: { date: 'desc' },
          })
          if (meeting) {
            await prisma.meeting.update({ where: { id: meeting.id }, data: { status: '完了' } })
          }
        }
      }
      return Response.json({ ok: true, updated: ids.length })
    }

    return Response.json({ error: 'invalid action' }, { status: 400 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
