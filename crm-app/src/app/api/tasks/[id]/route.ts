import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateTask } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/tasks/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json() as { status: string }
    const data: { status: string; doneAt?: Date } = { status: body.status }
    if (body.status === '完了') {
      data.doneAt = new Date()
    }
    const task = await updateTask(id, data)
    return Response.json(task)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
