'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, isAfter, parseISO } from 'date-fns'
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { Customer, CustomerStatus } from '@/types'
import { ALL_STATUSES } from '@/types'
import { StatusBadge, YomiRankBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

function formatDate(d: Date | string | null | undefined) {
  if (!d) return ''
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy/MM/dd') } catch { return String(d) }
}

function isOverdue(deadline: Date | string | null | undefined) {
  if (!deadline) return false
  try { return isAfter(new Date(), typeof deadline === 'string' ? parseISO(deadline) : deadline) } catch { return false }
}

const INITIAL_FORM = { name: '', kana: '', phone: '', email: '', ca: '', status: '初回未対応', inflow: '', area: '', company: '', job: '', salary: '', hopeJob: '', hopeArea: '', hopeSalary: '', timing: '', note: '' }

export function CustomerListClient() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [statusFilter, setStatusFilter] = useState('')
  const [caFilter, setCaFilter] = useState('')
  const [yomiFilter, setYomiFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('updatedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [saving, setSaving] = useState(false)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (caFilter) params.set('ca', caFilter)
      if (yomiFilter) params.set('yomi', yomiFilter)
      if (search) params.set('search', search)
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
      const res = await fetch(`/api/customers?${params}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as Customer[]
      setCustomers(data)
    } catch {
      setError('顧客データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, caFilter, yomiFilter, search, sortBy, sortDir])

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <ArrowUpDown size={13} className="text-gray-400 inline ml-1" />
    return sortDir === 'asc' ? <ArrowUp size={13} className="text-blue-500 inline ml-1" /> : <ArrowDown size={13} className="text-blue-500 inline ml-1" />
  }

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error('Failed')
      setShowModal(false)
      setForm(INITIAL_FORM)
      await fetchCustomers()
    } catch {
      alert('登録に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // Build CA options from loaded data
  const caOptions = Array.from(new Set(customers.map((c) => c.ca).filter((ca): ca is string => !!ca))).sort()

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">顧客一覧</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-[#0070D2] hover:bg-[#005fb2] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />
          新規登録
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="氏名・メール・電話で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">すべてのステータス</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={caFilter}
          onChange={(e) => setCaFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">すべての担当CA</option>
          {caOptions.map((ca) => (
            <option key={ca} value={ca}>{ca}</option>
          ))}
        </select>
        <select
          value={yomiFilter}
          onChange={(e) => setYomiFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ヨミランク</option>
          {['S', 'A', 'B', 'C', 'D'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button
          onClick={fetchCustomers}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
        >
          検索
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="animate-pulse space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">{error}</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p>該当する顧客が見つかりません</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('name')}>氏名<SortIcon col="name" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('status')}>ステータス<SortIcon col="status" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">担当CA</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('registeredAt')}>送客日<SortIcon col="registeredAt" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">次回アクション</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('nextDeadline')}>次回期限<SortIcon col="nextDeadline" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">ヨミ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => {
                const overdue = isOverdue(c.nextDeadline)
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => { window.location.href = `/customers/${c.id}` }}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/customers/${c.id}`} className="hover:text-blue-600" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      {c.kana && <div className="text-xs text-gray-400">{c.kana}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.ca}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(c.registeredAt)}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{c.nextAction}</td>
                    <td className={cn('px-4 py-3 font-medium', overdue ? 'text-red-600' : 'text-gray-700')}>
                      {formatDate(c.nextDeadline)}
                      {overdue && <span className="ml-1 text-xs">(!)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <YomiRankBadge rank={c.yomiRank} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {!loading && !error && customers.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-500">
            {customers.length}件
          </div>
        )}
      </div>
      {/* New Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">新規顧客登録</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              {[
                { label: '氏名 *', key: 'name', required: true },
                { label: 'フリガナ', key: 'kana' },
                { label: '電話番号', key: 'phone' },
                { label: 'メールアドレス', key: 'email' },
                { label: '担当CA', key: 'ca' },
                { label: '流入元', key: 'inflow' },
                { label: '居住地', key: 'area' },
                { label: '現職企業', key: 'company' },
                { label: '現職職種', key: 'job' },
                { label: '現在年収', key: 'salary' },
                { label: '希望職種', key: 'hopeJob' },
                { label: '希望勤務地', key: 'hopeArea' },
                { label: '希望年収', key: 'hopeSalary' },
                { label: '転職希望時期', key: 'timing' },
              ].map(({ label, key, required }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="text"
                    required={required}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">キャンセル</button>
                <button type="submit" disabled={saving} className="flex-1 bg-[#0070D2] hover:bg-[#005fb2] text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                  {saving ? '登録中...' : '登録'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
