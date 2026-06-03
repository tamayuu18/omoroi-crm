'use client'

import { useState, useEffect } from 'react'
import { isAfter, isThisWeek, parseISO, isToday } from 'date-fns'
import { Users, AlertCircle, Calendar, Clock } from 'lucide-react'
import type { Customer, Task, Meeting } from '@/types'
import { ALL_STATUSES } from '@/types'
import { statusColors } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

function KpiCard({
  icon, label, value, color
}: {
  icon: React.ReactNode; label: string; value: number | string; color: string
}) {
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

  // KPI calculations
  const totalCustomers = customers.length
  const unreachable = customers.filter((c) => c.status === '初回未対応').length
  const weekMeetings = meetings.filter((m) => {
    if (!m.date) return false
    try {
      const d = parseISO(m.date)
      return isThisWeek(d, { weekStartsOn: 1 }) || isToday(d)
    } catch { return false }
  }).length
  const overdueTasks = tasks.filter((t) => {
    if (t.status === '完了' || !t.deadline) return false
    try {
      return isAfter(new Date(), parseISO(t.deadline)) && !isToday(parseISO(t.deadline))
    } catch { return false }
  }).length

  // Status funnel
  const statusCounts = ALL_STATUSES.map((s) => ({
    status: s,
    count: customers.filter((c) => c.status === s).length,
  })).filter((x) => x.count > 0)
  const maxCount = Math.max(...statusCounts.map((x) => x.count), 1)

  // CA table
  const caMap = new Map<string, number>()
  customers.forEach((c) => {
    if (c.ca) caMap.set(c.ca, (caMap.get(c.ca) ?? 0) + 1)
  })
  const caRows = Array.from(caMap.entries()).sort((a, b) => b[1] - a[1])

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-gray-900">ダッシュボード</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users size={22} className="text-blue-600" />}
          label="総顧客数"
          value={totalCustomers}
          color="bg-blue-50"
        />
        <KpiCard
          icon={<AlertCircle size={22} className="text-gray-600" />}
          label="初回未対応"
          value={unreachable}
          color="bg-gray-100"
        />
        <KpiCard
          icon={<Calendar size={22} className="text-green-600" />}
          label="今週の面談数"
          value={weekMeetings}
          color="bg-green-50"
        />
        <KpiCard
          icon={<Clock size={22} className="text-red-500" />}
          label="期限切れタスク"
          value={overdueTasks}
          color="bg-red-50"
        />
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
                      <div
                        className={cn('h-full rounded-full transition-all', barColor)}
                        style={{ width: `${barWidth}%`, minWidth: barWidth > 0 ? '8px' : '0' }}
                      />
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
