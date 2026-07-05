import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateMeeting } from '@/lib/db'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/meetings/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json()
    const data: any = { ...body }
    if (body.date === '') data.date = null
    if (body.date && typeof body.date === 'string') data.date = new Date(body.date)
    if (body.nextDeadline === '') data.nextDeadline = null
    if (body.nextDeadline && typeof body.nextDeadline === 'string') data.nextDeadline = new Date(body.nextDeadline)
    const meeting = await updateMeeting(id, data)
    return Response.json(meeting)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update meeting' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/meetings/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    await prisma.meeting.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to delete meeting' }, { status: 500 })
  }
}
