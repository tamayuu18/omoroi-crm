import { NextRequest, NextResponse } from 'next/server'
import { normalizeCaRecords } from '@/lib/caBackfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/normalize-ca
 *
 * 担当CA名の表記ゆれ（例: 「岩田珠優（社用）」→「岩田珠優」）を毎日自動で正式名へ統一する。
 * 取り込み時にも正規化しているが、直接DBに入ったデータや新しい表記ゆれを拾うための保険。
 * 対象がなければ何も更新しない（冪等）。詳細は lib/caBackfill.ts を参照。
 *
 * Vercel Cron が Authorization: Bearer <CRON_SECRET> を付けて呼び出します。
 * 手元での動作確認用に ?key=<CRON_SECRET> でも実行できます。
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const key = req.nextUrl.searchParams.get('key') || ''
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await normalizeCaRecords(true)
    console.log('normalize-ca cron:', JSON.stringify({ targets: result.targets, updated: result.updated, changes: result.changes, errors: result.errors }))
    return NextResponse.json(result)
  } catch (e) {
    console.error('normalize-ca cron error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
