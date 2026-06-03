import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateTaskStatus } from '@/lib/sheets'

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/tasks/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json() as { status: string }
    await updateTaskStatus(id, body.status)
    return Response.json({ success: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
