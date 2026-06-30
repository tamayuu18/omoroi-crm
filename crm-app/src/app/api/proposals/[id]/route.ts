import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateProposal, deleteProposal } from '@/lib/db'
import { PROPOSAL_OFFER_STATUSES } from '@/lib/constants'

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/proposals/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json()
    const data: any = { ...body }
    // 内定以降に到達したら決着日を記録（未到達に戻ったらクリア）
    if (typeof body.status === 'string') {
      data.decidedAt = [...PROPOSAL_OFFER_STATUSES, '辞退', '見送り'].includes(body.status)
        ? new Date()
        : null
    }
    const proposal = await updateProposal(id, data)
    return Response.json(proposal)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update proposal' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/proposals/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    await deleteProposal(id)
    return Response.json({ ok: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to delete proposal' }, { status: 500 })
  }
}
