import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTasks } from '@/lib/db'
import { prisma } from '@/lib/prisma'

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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.customerId || !body.content) return Response.json({ error: 'customerId and content required' }, { status: 400 })
    const task = await prisma.task.create({
      data: {
        customerId: body.customerId,
        name: body.name ?? '',
        ca: body.ca ?? '',
        content: body.content,
        deadline: body.deadline ? new Date(body.deadline) : null,
        priority: body.priority ?? '中',
        status: '未完了',
        note: body.note ?? '',
      },
    })
    return Response.json(task, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
