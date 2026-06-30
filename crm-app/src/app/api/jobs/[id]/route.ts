import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateJob, deleteJob } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/jobs/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json()
    const job = await updateJob(id, body)
    return Response.json(job)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update job' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/jobs/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    await deleteJob(id)
    return Response.json({ ok: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to delete job' }, { status: 500 })
  }
}
