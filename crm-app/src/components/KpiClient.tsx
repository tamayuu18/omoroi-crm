'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import type { KpiRow } from '@/types'

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

type MetricLine = { label: string; value: number; rateLabel?: string; rate?: string }

function buildLines(r: KpiRow): MetricLine[] {
  return [
    { label: '面談設定数', value: r.meetingsSet },
    { label: '初回面談数', value: r.firstMeetings, rateLabel: '面談実施率', rate: rate(r.firstMeetings, r.meetingsSet) },
    { label: '求人提案数', value: r.proposals, rateLabel: '求人提案率', rate: rate(r.proposals, r.firstMeetings) },
    { label: '選考数', value: r.selections, rateLabel: '求人承諾率', rate: rate(r.selections, r.proposals) },
    { label: '内定数', value: r.offers, rateLabel: '選考通過率', rate: rate(r.offers, r.selections) },
    { label: '内定承諾数', value: r.accepted, rateLabel: '内定承諾率', rate: rate(r.accepted, r.offers) },
  ]
}

function CaCard({ row }: { row: KpiRow }) {
  const lines = buildLines(row)
  const total = row.meetingsSet + row.firstMeetings + row.proposals + row.selections + row.offers + row.accepted
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 font-bold text-gray-800">{row.ca}</div>
      <table className="w-full text-sm">
        <tbody>
          {lines.map(l => (
            <tr key={l.label} className="border-b border-gray-50 last:border-0">
              <td className="py-1.5 px-4 text-gray-600 w-32">{l.label}</td>
              <td className="py-1.5 px-2 text-right font-medium text-gray-900 w-10 tabular-nums">{l.value}</td>
              <td className="py-1.5 px-2 text-gray-400 text-xs">{l.rateLabel}</td>
              <td className="py-1.5 px-4 text-right w-16">
                {l.rate ? (
                  <span className={l.rate === '—' ? 'text-gray-300' : 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-xs font-medium'}>{l.rate}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total === 0 && <div className="px-4 py-2 text-xs text-gray-300">この月のデータはありません</div>}
    </div>
  )
}

export function KpiClient() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [rows, setRows] = useState<KpiRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchKpi = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/kpi?month=${month}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setRows(data.rows)
    }
    setLoading(false)
  }, [month])

  useEffect(() => { fetchKpi() }, [fetchKpi])

  // 全CA合計
  const totals = rows.reduce<KpiRow>(
    (acc, r) => ({
      ca: '全体',
      meetingsSet: acc.meetingsSet + r.meetingsSet,
      firstMeetings: acc.firstMeetings + r.firstMeetings,
      proposals: acc.proposals + r.proposals,
      selections: acc.selections + r.selections,
      offers: acc.offers + r.offers,
      accepted: acc.accepted + r.accepted,
    }),
    { ca: '全体', meetingsSet: 0, firstMeetings: 0, proposals: 0, selections: 0, offers: 0, accepted: 0 }
  )

  const [y, m] = month.split('-')

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={20} className="text-[#0070D2]" /> KPI管理（CA別・自動集計）
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 text-gray-500 hover:text-gray-800 rounded hover:bg-gray-100"><ChevronLeft size={18} /></button>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 text-gray-500 hover:text-gray-800 rounded hover:bg-gray-100"><ChevronRight size={18} /></button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        面談はカレンダー(面談)から、求人提案・選考・内定・承諾は顧客詳細の「提案求人」から自動集計しています（{y}年{Number(m)}月）。
      </p>

      {loading ? (
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-56 bg-white rounded-xl" />)}</div>
      ) : (
        <>
          <CaCard row={totals} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rows.map(r => <CaCard key={r.ca} row={r} />)}
          </div>
        </>
      )}
    </div>
  )
}
