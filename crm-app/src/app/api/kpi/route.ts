export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getAppSession } from '@/lib/session'
import { getKpi, getKpiLeadTimes } from '@/lib/db'
import { isKpiPeriod, kpiRangeForMonth, kpiRangeForPeriod } from '@/lib/kpiPeriod'

// GET /api/kpi?month=YYYY-MM         … 月別
// GET /api/kpi?period=1m|3m|6m|1y    … 今日までの 1ヶ月以内 / 3ヶ月以内 / 半年以内 / 1年以内
// period が指定されていれば period を優先する。どちらも無ければ今月。
export async function GET(request: NextRequest) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const periodParam = request.nextUrl.searchParams.get('period')
    if (periodParam !== null) {
      if (!isKpiPeriod(periodParam)) {
        return Response.json({ error: 'periodは1m/3m/6m/1yのいずれかで指定してください' }, { status: 400 })
      }
      const range = kpiRangeForPeriod(periodParam)
      const [rows, leadTimes] = await Promise.all([getKpi(range), getKpiLeadTimes(range)])
      return Response.json({ period: periodParam, start: range.start, end: range.end, rows, leadTimes })
    }

    const month = request.nextUrl.searchParams.get('month')
      ?? new Date().toISOString().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return Response.json({ error: 'monthはYYYY-MM形式で指定してください' }, { status: 400 })
    }
    const range = kpiRangeForMonth(month)
    const [rows, leadTimes] = await Promise.all([getKpi(range), getKpiLeadTimes(range)])
    return Response.json({ month, start: range.start, end: range.end, rows, leadTimes })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to compute KPI' }, { status: 500 })
  }
}
