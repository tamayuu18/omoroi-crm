import { NextRequest, NextResponse } from 'next/server'
import { normalizeCaRecords } from '@/lib/caBackfill'

export const dynamic = 'force-dynamic'

/**
 * GET /api/maintenance/normalize-ca
 *
 * 担当CA名の表記ゆれ（例: 「岩田珠優（社用）」→「岩田珠優」）を正式名へ統一する過去データ修正。
 * 詳細は lib/caBackfill.ts を参照。
 *
 * デフォルトは対象一覧（表記 → 正式名 と件数）を返すだけでDBには書き込まない。?apply=1 で実際に更新。
 * CRON_SECRET が設定されていれば Authorization: Bearer <secret> または ?key=<secret> で認証。
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

  const apply = req.nextUrl.searchParams.get('apply') === '1'
  const result = await normalizeCaRecords(apply)
  return NextResponse.json(result)
}
