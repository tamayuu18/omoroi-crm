import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateJob, deleteJob } from '@/lib/db'
import { prisma } from '@/lib/prisma'

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
    const proposalCount = await prisma.jobProposal.count({ where: { jobId: id } })
    if (proposalCount > 0) {
      return Response.json(
        { error: `この求人には提案履歴が${proposalCount}件あるため削除できません。募集を終了する場合は求人の状況を「クローズ」に変更してください。` },
        { status: 409 }
      )
    }
    await deleteJob(id)
    return Response.json({ ok: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to delete job' }, { status: 500 })
  }
}
