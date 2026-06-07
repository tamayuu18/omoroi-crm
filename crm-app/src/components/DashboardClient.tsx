'use client'

import { useState, useEffect } from 'react'
import { isAfter, isThisWeek, isToday, format } from 'date-fns'
import { Users, AlertCircle, Calendar, Clock } from 'lucide-react'
import type { Customer, Task, Meeting } from '@/types'
import { ALL_STATUSES } from '@/types'
import { CA_OPTIONS } from '@/lib/constants'
import { statusColors } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

// ヨミ判定ステータス（受注可能性あり）
const YOMI_STATUSES = ['求人提案中', '応募意思確認中', '応募済み', '書類選考中', '一次面接予定', '一次面接結果待ち', '最終面接予定', '最終面接結果待ち', '内定', '承諾', '入社予定']
const CLOSED_STATUSES = ['入社済み']

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
      <div className={cn('p-3 rounded-lg', color)}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}

export function DashboardClient() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [caFilter, setCaFilter] = useState('')

  useEffect(() => {
    async function fetchData() {
      const [cRes, tRes, mRes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/tasks'),
        fetch('/api/meetings'),
      ])
      if (cRes.ok) setCustomers(await cRes.json())
      if (tRes.ok) setTasks(await tRes.json())
      if (mRes.ok) setMeetings(await mRes.json())
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-xl" />)}
          </div>
          <div className="h-64 bg-white rounded-xl" />
        </div>
      </div>
    )
  }

  const filtered = caFilter ? customers.filter(c => c.ca === caFilter) : customers

  // KPI
  const totalCustomers = filtered.length
  const unreachable = filtered.filter(c => c.status === '初回未対応').length
  const weekMeetings = meetings.filter(m => {
    if (!m.date) return false
    try {
      const d = new Date(m.date as unknown as string)
      return isThisWeek(d, { weekStartsOn: 1 }) || isToday(d)
    } catch { return false }
  }).length
  const overdueTasks = tasks.filter(t => {
    if (t.status === '完了' || !t.deadline) return false
    try {
      const d = new Date(t.deadline as unknown as string)
      return isAfter(new Date(), d) && !isToday(d)
    } catch { return false }
  }).length

  // Status funnel
  const statusCounts = ALL_STATUSES.map(s => ({
    status: s,
    count: filtered.filter(c => c.status === s).length,
  })).filter(x => x.count > 0)
  const maxCount = Math.max(...statusCounts.map(x => x.count), 1)

  // CA table
  const caMap = new Map<string, number>()
  filtered.forEach(c => { if (c.ca) caMap.set(c.ca, (caMap.get(c.ca) ?? 0) + 1) })
  const caRows = Array.from(caMap.entries()).sort((a, b) => b[1] - a[1])

  // ========== 月別ヨミ表 ==========
  // expectedCloseMonth がある顧客を月別 × ステータス別に集計
  type YomiCustomer = Customer & { expectedCloseMonth?: string | null }
  const yomiCustomers = (filtered as YomiCustomer[]).filter(c =>
    c.expectedCloseMonth && (YOMI_STATUSES.includes(c.status) || CLOSED_STATUSES.includes(c.status))
  )

  // 月リスト（今月から6ヶ月先まで + データにある月）
  const thisMonth = format(new Date(), 'yyyy-MM')
  const futureMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() + i)
    return format(d, 'yyyy-MM')
  })
  const dataMonths = [...new Set(yomiCustomers.map(c => c.expectedCloseMonth!))]
  const allMonths = [...new Set([...futureMonths, ...dataMonths])].sort()

  // ステータスグループ
  const YOMI_GROUPS = [
    { label: '求人提案・応募', statuses: ['求人提案中', '応募意思確認中', '応募済み'], color: 'bg-blue-100 text-blue-700' },
    { label: '選考中', statuses: ['書類選考中', '一次面接予定', '一次面接結果待ち', '最終面接予定', '最終面接結果待ち'], color: 'bg-yellow-100 text-yellow-700' },
    { label: '内定・承諾', statuses: ['内定', '承諾', '入社予定'], color: 'bg-green-100 text-green-700' },
    { label: '入社済み', statuses: ['入社済み'], color: 'bg-gray-100 text-gray-700' },
  ]

  function getMonthCount(month: string, statuses: string[]) {
    return yomiCustomers.filter(c => c.expectedCloseMonth === month && statuses.includes(c.status)).length
  }

  function getMonthCustomers(month: string) {
    return yomiCustomers.filter(c => c.expectedCloseMonth === month)
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">ダッシュボード</h1>
        <select value={caFilter} onChange={e => setCaFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">全CA</option>
          {CA_OPTIONS.map(ca => <option key={ca} value={ca}>{ca}</option>)}
        </select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Users size={22} className="text-blue-600" />} label="総顧客数" value={totalCustomers} color="bg-blue-50" />
        <KpiCard icon={<AlertCircle size={22} className="text-gray-600" />} label="初回未対応" value={unreachable} color="bg-gray-100" />
        <KpiCard icon={<Calendar size={22} className="text-green-600" />} label="今週の面談数" value={weekMeetings} color="bg-green-50" />
        <KpiCard icon={<Clock size={22} className="text-red-500" />} label="期限切れタスク" value={overdueTasks} color="bg-red-50" />
      </div>

      {/* 月別ヨミ表 */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-bold text-gray-700 mb-4">月別ヨミ（受注予定月別）</h2>
        {allMonths.length === 0 ? (
          <p className="text-gray-400 text-sm">受注予定月が設定された顧客がありません。顧客詳細ページで「受注予定月」を設定してください。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-semibold text-gray-600 w-24">月</th>
                  {YOMI_GROUPS.map(g => (
                    <th key={g.label} className="text-center py-2 px-3 font-semibold text-gray-600">{g.label}</th>
                  ))}
                  <th className="text-center py-2 px-3 font-semibold text-gray-600">合計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allMonths.map(month => {
                  const total = getMonthCustomers(month).length
                  const isCurrentMonth = month === thisMonth
                  return (
                    <tr key={month} className={cn('hover:bg-gray-50', isCurrentMonth && 'bg-blue-50/50')}>
                      <td className="py-2 pr-4 font-medium text-gray-700">
                        {month.replace('-', '/')}
                        {isCurrentMonth && <span className="ml-1 text-xs text-blue-500">今月</span>}
                      </td>
                      {YOMI_GROUPS.map(g => {
                        const count = getMonthCount(month, g.statuses)
                        return (
                          <td key={g.label} className="py-2 px-3 text-center">
                            {count > 0 ? (
                              <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', g.color)}>
                                {count}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2 px-3 text-center font-bold text-gray-700">{total || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* 詳細リスト */}
        {yomiCustomers.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">対象顧客一覧を表示</summary>
            <div className="mt-2 space-y-1">
              {yomiCustomers.sort((a, b) => (a.expectedCloseMonth ?? '').localeCompare(b.expectedCloseMonth ?? '')).map(c => (
                <a key={c.id} href={`/customers/${c.id}`}
                  className="flex items-center gap-3 text-xs px-2 py-1.5 rounded hover:bg-gray-50">
                  <span className="w-16 text-gray-500">{c.expectedCloseMonth?.replace('-', '/')}</span>
                  <span className="font-medium text-gray-800">{c.name}</span>
                  <span className="text-gray-500">{c.ca}</span>
                  <span className="ml-auto text-gray-500">{c.status}</span>
                </a>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Two-column: funnel + CA table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status funnel */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-700 mb-4">ステータス別顧客数</h2>
          {statusCounts.length === 0 ? (
            <p className="text-gray-400 text-sm">データがありません</p>
          ) : (
            <div className="space-y-2">
              {statusCounts.map(({ status, count }) => {
                const colorClass = statusColors[status] ?? 'bg-gray-100 text-gray-600'
                const barColor = colorClass.split(' ')[0]
                const barWidth = Math.round((count / maxCount) * 100)
                return (
                  <div key={status} className="flex items-center gap-2 text-sm">
                    <span className="w-28 shrink-0 text-gray-600 text-right text-xs">{status}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', barColor)}
                        style={{ width: `${barWidth}%`, minWidth: barWidth > 0 ? '8px' : '0' }} />
                    </div>
                    <span className="w-6 text-xs text-gray-500 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* CA table */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-700 mb-4">CA別担当件数</h2>
          {caRows.length === 0 ? (
            <p className="text-gray-400 text-sm">データがありません</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left pb-2 text-gray-500 font-medium">担当CA</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">件数</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">割合</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {caRows.map(([ca, count]) => (
                  <tr key={ca} className="hover:bg-gray-50">
                    <td className="py-2 text-gray-800">{ca}</td>
                    <td className="py-2 text-right font-medium text-gray-900">{count}</td>
                    <td className="py-2 text-right text-gray-500">
                      {totalCustomers > 0 ? `${Math.round((count / totalCustomers) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
