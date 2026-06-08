import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateTask } from '@/lib/db'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/tasks/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json()
    const data: any = { ...body }
    if (body.deadline === '') data.deadline = null
    if (body.deadline && typeof body.deadline === 'string') data.deadline = new Date(body.deadline)
    if (body.status === '完了') data.doneAt = new Date()
    const task = await updateTask(id, data)
    return Response.json(task)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/tasks/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    await prisma.task.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
