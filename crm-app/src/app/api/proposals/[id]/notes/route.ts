import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addProposalNote } from '@/lib/db'

// 提案ごとの社内メモは追記専用。編集・削除のエンドポイントは意図的に用意していない
// （過去のメモを絶対に消さないため）。
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/proposals/[id]/notes'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json()
    if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
      return Response.json({ error: 'メモを入力してください' }, { status: 400 })
    }
    const note = await addProposalNote(id, { content: body.content.trim(), createdBy: session.user?.name })
    return Response.json(note, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to add note' }, { status: 500 })
  }
}
