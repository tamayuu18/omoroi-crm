'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, FileWarning } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { KpiRow, KpiLeadTimeRow } from '@/types'
import { DOC_SUBMIT_ALERT_BUSINESS_DAYS } from '@/lib/constants'
import { KPI_PERIODS, KPI_PERIOD_LABELS, type KpiPeriod } from '@/lib/kpiPeriod'
import { cn } from '@/lib/utils'

// 表示モード: 月別 or 直近期間（1ヶ月以内 / 3ヶ月以内 / 半年以内 / 1年以内）
type KpiView = 'month' | KpiPeriod

// 月を1つずらす（'YYYY-MM'）
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 率（分子/分母）。分母0は '—'
function rate(num: number, den: number): string {
  if (den === 0) return '—'
  return `${Math.round((num / den) * 100)}%`
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return '—'
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'M/d') } catch { return '—' }
}

type MetricLine = { label: string; value: number; unit: '人' | '件'; rateLabel?: string; rate?: string; rateNote?: string }

function buildLines(r: KpiRow): MetricLine[] {
  return [
    { label: '面談設定数', value: r.meetingsSet, unit: '人' },
    { label: '初回面談数', value: r.firstMeetings, unit: '人', rateLabel: '面談実施率', rate: rate(r.firstMeetings, r.meetingsSet) },
    { label: '求人提案数', value: r.proposals, unit: '人', rateLabel: '求人提案率', rate: rate(r.proposals, r.firstMeetings) },
    { label: '選考数', value: r.selections, unit: '人', rateLabel: '求人承諾率', rate: rate(r.selections, r.proposals) },
    { label: '応募件数', value: r.applications, unit: '件' },
    { label: '面接数', value: r.interviews, unit: '人', rateLabel: '面接移行率', rate: rate(r.interviews, r.selections) },
    {
      label: '一次面接実施件数', value: r.firstInterviews, unit: '件',
      rateLabel: '一次面接実施率', rate: rate(r.firstInterviewCustomers, r.firstMeetings),
      rateNote: `${r.firstInterviewCustomers}人 / 初回面談${r.firstMeetings}人`,
    },
    { label: '内定数', value: r.offers, unit: '人', rateLabel: '選考通過率', rate: rate(r.offers, r.selections) },
    { label: '内定承諾数', value: r.accepted, unit: '人', rateLabel: '内定承諾率', rate: rate(r.accepted, r.offers) },
  ]
}

// KPI行の合計値（0ならその期間にデータが無い）
function rowTotal(r: KpiRow): number {
  return buildLines(r).reduce((sum, l) => sum + l.value, 0)
}

// CA別カード。見出しをクリックすると明細を畳める（アコーディオン）
function CaCard({ row, defaultOpen = true }: { row: KpiRow; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const lines = buildLines(row)
  const total = rowTotal(row)
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={cn('w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left font-bold text-gray-800 hover:bg-gray-50',
          open && 'border-b border-gray-100')}>
        <span className="flex items-center gap-2">
          {row.ca}
          {!open && (
            <span className="text-xs font-normal text-gray-400">
              面談設定{row.meetingsSet}人 / 初回面談{row.firstMeetings}人 / 内定承諾{row.accepted}人
            </span>
          )}
        </span>
        <ChevronDown size={16} className={cn('text-gray-400 shrink-0 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && (<>
      <table className="w-full text-sm">
        <tbody>
          {lines.map(l => (
            <tr key={l.label} className="border-b border-gray-50 last:border-0">
              <td className="py-1.5 px-4 text-gray-600 w-36">{l.label}</td>
              <td className="py-1.5 px-2 text-right font-medium text-gray-900 w-14 tabular-nums whitespace-nowrap">
                {l.value}<span className="text-xs font-normal text-gray-400 ml-0.5">{l.unit}</span>
              </td>
              <td className="py-1.5 px-2 text-gray-400 text-xs" title={l.rateNote}>{l.rateLabel}</td>
              <td className="py-1.5 px-4 text-right w-16">
                {l.rate ? (
                  <span title={l.rateNote} className={l.rate === '—' ? 'text-gray-300' : 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-xs font-medium'}>{l.rate}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total === 0 && <div className="px-4 py-2 text-xs text-gray-300">この期間のデータはありません</div>}
      </>)}
    </div>
  )
}

// 候補者別リードタイム（初回面談→書類提出→一次面接実施）
function LeadTimeTable({ rows }: { rows: KpiLeadTimeRow[] }) {
  const [alertOnly, setAlertOnly] = useState(false)
  const [caFilter, setCaFilter] = useState('')
  const cas = Array.from(new Set(rows.map(r => r.ca)))
  const shown = rows.filter(r => (!alertOnly || r.docAlert) && (!caFilter || r.ca === caFilter))
  const alertCount = rows.filter(r => r.docAlert).length

  const docCell = (r: KpiLeadTimeRow) => {
    if (r.docBusinessDays === null) return <span className="text-gray-300">—</span>
    return (
      <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium tabular-nums whitespace-nowrap',
        r.docAlert ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700')}>
        {r.docBusinessDays}営業日{r.docPending ? '経過' : ''}
      </span>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-bold text-gray-800">候補者別リードタイム</div>
          <div className="text-xs text-gray-400 mt-0.5">
            初回面談→書類提出（営業日）、初回面談→一次面接実施（日数）。書類提出まで{DOC_SUBMIT_ALERT_BUSINESS_DAYS}営業日以上は赤で表示
            {alertCount > 0 && <span className="ml-1 text-red-600 font-medium">（{alertCount}人）</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <select value={caFilter} onChange={e => setCaFilter(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs">
            <option value="">全CA</option>
            {cas.map(ca => <option key={ca} value={ca}>{ca}</option>)}
          </select>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={alertOnly} onChange={e => setAlertOnly(e.target.checked)} />
            {DOC_SUBMIT_ALERT_BUSINESS_DAYS}営業日以上のみ
          </label>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-300">該当する求職者がいません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">氏名</th>
                <th className="text-left px-2 py-2 font-semibold">担当CA</th>
                <th className="text-left px-2 py-2 font-semibold">ステータス</th>
                <th className="text-left px-2 py-2 font-semibold">初回面談</th>
                <th className="text-left px-2 py-2 font-semibold">書類提出</th>
                <th className="text-left px-2 py-2 font-semibold">営業日数</th>
                <th className="text-left px-2 py-2 font-semibold">一次面接</th>
                <th className="text-left px-4 py-2 font-semibold">日数</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.customerId} className={cn('border-t border-gray-50', r.docAlert && 'bg-red-50/40')}>
                  <td className="px-4 py-2">
                    <a href={`/customers/${r.customerId}`} className="text-blue-600 hover:underline font-medium">{r.name}</a>
                  </td>
                  <td className="px-2 py-2 text-gray-500 text-xs">{r.ca}</td>
                  <td className="px-2 py-2 text-gray-500 text-xs">{r.status}</td>
                  <td className="px-2 py-2 text-gray-700 tabular-nums">
                    {fmtDate(r.firstMeetingAt)}
                    {!r.meetingHeld && <span className="ml-1 text-xs text-gray-400">未実施</span>}
                  </td>
                  <td className="px-2 py-2 text-gray-700 tabular-nums">
                    {r.appliedAt ? fmtDate(r.appliedAt) : <span className={r.docPending ? 'text-red-600 text-xs' : 'text-gray-300'}>{r.docPending ? '未提出' : '—'}</span>}
                  </td>
                  <td className="px-2 py-2">{docCell(r)}</td>
                  <td className="px-2 py-2 text-gray-700 tabular-nums">{r.firstInterviewAt ? fmtDate(r.firstInterviewAt) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {r.interviewDays !== null
                      ? <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 whitespace-nowrap">{r.interviewDays}日</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const EMPTY_TOTALS: KpiRow = {
  ca: '全体', meetingsSet: 0, firstMeetings: 0, proposals: 0, selections: 0, applications: 0,
  interviews: 0, firstInterviews: 0, firstInterviewCustomers: 0, offers: 0, accepted: 0,
}

export function KpiClient() {
  const [view, setView] = useState<KpiView>('month')
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [rows, setRows] = useState<KpiRow[]>([])
  const [leadTimes, setLeadTimes] = useState<KpiLeadTimeRow[]>([])
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchKpi = useCallback(async () => {
    setLoading(true)
    const query = view === 'month' ? `month=${month}` : `period=${view}`
    const res = await fetch(`/api/kpi?${query}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setRows(data.rows)
      setLeadTimes(data.leadTimes ?? [])
      setRange(data.start && data.end ? { start: data.start, end: data.end } : null)
    }
    setLoading(false)
  }, [view, month])

  useEffect(() => { fetchKpi() }, [fetchKpi])

  // データが1件も無いCAはカードを出さない（全体の合計には影響しない）
  const activeRows = rows.filter(r => rowTotal(r) > 0)

  // 全CA合計
  const totals = rows.reduce<KpiRow>(
    (acc, r) => ({
      ca: '全体',
      meetingsSet: acc.meetingsSet + r.meetingsSet,
      firstMeetings: acc.firstMeetings + r.firstMeetings,
      proposals: acc.proposals + r.proposals,
      selections: acc.selections + r.selections,
      applications: acc.applications + r.applications,
      interviews: acc.interviews + r.interviews,
      firstInterviews: acc.firstInterviews + r.firstInterviews,
      firstInterviewCustomers: acc.firstInterviewCustomers + r.firstInterviewCustomers,
      offers: acc.offers + r.offers,
      accepted: acc.accepted + r.accepted,
    }),
    EMPTY_TOTALS
  )

  const [y, m] = month.split('-')
  // 説明文に出す期間の呼び方（月別: 「2026年10月」、直近期間: 「直近3ヶ月以内（7/19〜10/19）」）
  const periodLabel = view === 'month'
    ? `${y}年${Number(m)}月`
    : `直近${KPI_PERIOD_LABELS[view]}${range ? `（${fmtDate(range.start)}〜${fmtDate(new Date(parseISO(range.end).getTime() - 1))}）` : ''}`
  const periodNoun = view === 'month' ? 'この月' : 'この期間'

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={20} className="text-[#0070D2]" /> KPI管理（CA別・自動集計）
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
            {(['month', ...KPI_PERIODS] as KpiView[]).map(v => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={cn('px-2.5 py-1 rounded-md whitespace-nowrap transition-colors',
                  view === v ? 'bg-[#0070D2] text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}>
                {v === 'month' ? '月別' : KPI_PERIOD_LABELS[v]}
              </button>
            ))}
          </div>
          {view === 'month' && (
            <div className="flex items-center gap-2">
              <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 text-gray-500 hover:text-gray-800 rounded hover:bg-gray-100"><ChevronLeft size={18} /></button>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
              <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 text-gray-500 hover:text-gray-800 rounded hover:bg-gray-100"><ChevronRight size={18} /></button>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        「人」の数値は人数ベース（同じ求職者に複数の面談・提案があっても各段階で1人として計上）、「件」の数値は応募社数ベース（1人が2社に応募すれば2件）です。面談設定数・初回面談数は面談日、求人提案数以降は求職者の初回面談日を基準に自動集計しています（{periodLabel}に初回面談をした求職者について、その後の提案・応募・選考・面接・内定・承諾も{periodNoun}の実績として計上）。一次面接実施率は「一次面接を1件以上実施した人数 ÷ 初回面談数」です。
      </p>

      {loading ? (
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-56 bg-white rounded-xl" />)}</div>
      ) : (
        <>
          <CaCard row={totals} />
          {activeRows.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center text-sm text-gray-300">この期間にデータのあるCAはいません</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeRows.map(r => <CaCard key={r.ca} row={r} />)}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400 pt-2">
            <FileWarning size={14} className="text-amber-500" />
            書類提出が遅れている求職者は、ダッシュボードにも「書類提出が遅れている求職者」として表示されます。
          </div>
          <LeadTimeTable rows={leadTimes} />
        </>
      )}
    </div>
  )
}
