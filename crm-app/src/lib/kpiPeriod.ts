// KPIタブの集計期間。
//  - 月別: 'YYYY-MM' で1ヶ月分
//  - 直近期間: 今日（日本時間）までの 1ヶ月以内 / 3ヶ月以内 / 半年以内 / 1年以内
// サーバー（API・DB集計）とブラウザ（KPI画面）の両方から使うため、Prisma には依存しない。

import { jstDayEndUtc, toJstDateKey } from './leadTime'

export const KPI_PERIODS = ['1m', '3m', '6m', '1y'] as const
export type KpiPeriod = (typeof KPI_PERIODS)[number]

export const KPI_PERIOD_LABELS: Record<KpiPeriod, string> = {
  '1m': '1ヶ月以内',
  '3m': '3ヶ月以内',
  '6m': '半年以内',
  '1y': '1年以内',
}

const KPI_PERIOD_MONTHS: Record<KpiPeriod, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }

export function isKpiPeriod(v: unknown): v is KpiPeriod {
  return typeof v === 'string' && (KPI_PERIODS as readonly string[]).includes(v)
}

/** 集計範囲 [start, end)（UTCのDate） */
export type KpiRange = { start: Date; end: Date }

/** 月（'YYYY-MM'）の範囲 */
export function kpiRangeForMonth(month: string): KpiRange {
  const [y, m] = month.split('-').map(Number)
  return { start: new Date(y, (m ?? 1) - 1, 1), end: new Date(y, m ?? 1, 1) }
}

/**
 * 直近期間の範囲。終わりは今日（日本時間）の終わり、始まりはそのNヶ月前の同日0:00（日本時間）。
 * 例: 今日が 2026-10-19 で '3m' なら 2026-07-19 0:00 〜 2026-10-19 23:59（JST）
 */
export function kpiRangeForPeriod(period: KpiPeriod, now: Date = new Date()): KpiRange {
  const end = jstDayEndUtc(now)
  const [y, m, d] = toJstDateKey(now)!.split('-').map(Number)
  const startMonth = m - 1 - KPI_PERIOD_MONTHS[period]
  // Nヶ月前の同日が存在しない場合（例: 3/31 の1ヶ月前）はその月の末日（2/28）にする
  const lastDay = new Date(Date.UTC(y, startMonth + 1, 0)).getUTCDate()
  const startJst = Date.UTC(y, startMonth, Math.min(d, lastDay))
  const start = new Date(startJst - 9 * 60 * 60 * 1000)
  return { start, end }
}
