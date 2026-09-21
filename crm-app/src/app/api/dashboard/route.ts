export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDashboardStats } from '@/lib/db'

/**
 * GET /api/dashboard
 *
 * ダッシュボード用の集計を返す。以前は画面側が /api/customers・/api/tasks・/api/meetings を
 * 全件取得して数えていたため、証明写真（base64）を含む全顧客データが毎回転送されていた。
 * 件数はDB側で集計し、ヨミ表に必要な最小限のカラムだけを返す。
 *
 * 「今週」「今日」の境界はブラウザのタイムゾーンで決めたいので、画面側から ISO 文字列で受け取る。
 *   ca=…              担当CAで絞り込み（顧客数・ステータス別・ヨミ表に適用。面談数・タスク数は従来どおり全体）
 *   weekStart/weekEnd 今週の範囲 [weekStart, weekEnd)
 *   todayStart        今日の0時（これより前の期限のタスクを期限切れとみなす）
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const params = request.nextUrl.searchParams
    const ca = params.get('ca') || undefined
    const parseDate = (key: string, fallback: Date) => {
      const v = params.get(key)
      if (!v) return fallback
      const d = new Date(v)
      return Number.isNaN(d.getTime()) ? fallback : d
    }
    const now = new Date()
    const todayStart = parseDate('todayStart', new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    // 既定は月曜始まりの今週
    const defaultWeekStart = new Date(todayStart)
    defaultWeekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7))
    const defaultWeekEnd = new Date(defaultWeekStart)
    defaultWeekEnd.setDate(defaultWeekStart.getDate() + 7)
    const weekStart = parseDate('weekStart', defaultWeekStart)
    const weekEnd = parseDate('weekEnd', defaultWeekEnd)
    const cancelledSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const stats = await getDashboardStats({ ca, weekStart, weekEnd, todayStart, cancelledSince })
    return Response.json(stats)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to compute dashboard stats' }, { status: 500 })
  }
}
