import { NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/schema'

export const dynamic = 'force-dynamic'

/**
 * GET /api/setup
 *
 * テーブル作成・カラム追加（冪等）。ターミナルなしで環境を初期化・更新するためのルート。
 * 実体は src/lib/schema.ts の ensureSchema()。
 */
export async function GET() {
  try {
    await ensureSchema()
    return NextResponse.json({ ok: true, message: 'Tables created successfully' })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
