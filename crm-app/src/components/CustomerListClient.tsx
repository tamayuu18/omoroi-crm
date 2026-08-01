'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { format, isAfter, parseISO } from 'date-fns'
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown, Upload, Trash2, Edit, X, Check, ChevronDown } from 'lucide-react'
import type { Customer, CustomerStatus } from '@/types'
import { ALL_STATUSES } from '@/types'
import { CA_OPTIONS, INFLOW_OPTIONS, PREF_OPTIONS, GENDER_OPTIONS, TIMING_OPTIONS } from '@/lib/constants'
import { StatusBadge, YomiRankBadge, TaskBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

function formatDate(d: Date | string | null | undefined) {
  if (!d) return ''
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy/MM/dd') } catch { return String(d) }
}

function isOverdue(deadline: Date | string | null | undefined) {
  if (!deadline) return false
  try { return isAfter(new Date(), typeof deadline === 'string' ? parseISO(deadline) : deadline) } catch { return false }
}

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const INITIAL_FORM = {
  name: '', kana: '', phone: '', email: '', ca: '', gender: '', status: '初回未対応',
  inflow: '', area: '', company: '', job: '', salary: '', hopeJob: '', hopeArea: '',
  hopeSalary: '', timing: '', expectedCloseMonth: '', note: ''
}

const PREVIEW_LABELS: Record<string, string> = {
  name: '氏名', kana: 'フリガナ', phone: '電話番号', email: 'メール',
  age: '年齢', gender: '性別', area: '居住地', company: '現職企業',
  job: '現職職種', salary: '現在年収', hopeJob: '希望職種', hopeArea: '希望勤務地',
  hopeSalary: '希望年収', timing: '転職時期', ca: '担当CA', inflow: '流入元',
  status: 'ステータス', yomiRank: 'ヨミ', expectedCloseMonth: '受注予定月', note: '備考',
}

// ========== CSV Preview Modal ==========
function CsvPreviewModal({
  rows, total, onConfirm, onClose, importing
}: {
  rows: Record<string, string>[]
  total: number
  onConfirm: () => void
  onClose: () => void
  importing: boolean
}) {
  const cols = ['name', 'kana', 'phone', 'email', 'ca', 'inflow', 'status', 'area', 'company', 'job']
  const presentCols = cols.filter(c => rows.some(r => r[c]))

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold">CSVインポート確認</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {total}件を読み込みました。内容を確認してから登録してください。
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Preview table */}
        <div className="overflow-auto flex-1 p-4">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-red-500">
              <p className="font-medium">氏名が取得できる行がありませんでした。</p>
              <p className="text-sm mt-1 text-gray-500">CSVのヘッダー行に「氏名」列が必要です。</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="border border-gray-200 px-2 py-1.5 text-left text-gray-600">#</th>
                  {presentCols.map(c => (
                    <th key={c} className="border border-gray-200 px-2 py-1.5 text-left text-gray-600">
                      {PREVIEW_LABELS[c] ?? c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={cn('hover:bg-blue-50', !row.name && 'bg-red-50')}>
                    <td className="border border-gray-200 px-2 py-1.5 text-gray-400">{i + 1}</td>
                    {presentCols.map(c => (
                      <td key={c} className={cn(
                        'border border-gray-200 px-2 py-1.5 max-w-[180px] truncate',
                        c === 'name' && !row[c] && 'bg-red-100 text-red-600',
                        c === 'name' && row[c] && 'font-medium text-gray-800'
                      )}>
                        {row[c] || <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {total > rows.length && (
            <p className="mt-2 text-xs text-gray-400 text-center">表示は最初の{rows.length}件。合計{total}件が登録されます。</p>
          )}
        </div>

        {rows.length > 0 && (
          <div className="p-4 border-t bg-gray-50 flex gap-3 justify-end shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">
              キャンセル
            </button>
            <button onClick={onConfirm} disabled={importing}
              className="px-6 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2] disabled:opacity-50 font-medium">
              {importing ? '登録中...' : `${total}件を登録する`}
            </button>
          </div>
        )}
        {rows.length === 0 && (
          <div className="p-4 border-t bg-gray-50 flex justify-end shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">閉じる</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ========== Bulk Status Modal ==========
function BulkStatusModal({ count, onApply, onClose }: { count: number; onApply: (s: string) => void; onClose: () => void }) {
  const [status, setStatus] = useState(ALL_STATUSES[0])
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold mb-4">一括ステータス変更（{count}件）</h2>
        <select value={status} onChange={e => setStatus(e.target.value as CustomerStatus)} className={inp + ' mb-4'}>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={() => onApply(status)} className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2]">変更する</button>
        </div>
      </div>
    </div>
  )
}

// ========== Status Multi-Select (checkbox dropdown) ==========
function StatusMultiSelect({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (s: string) =>
    onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s])

  const label =
    selected.length === 0 ? 'すべてのステータス'
    : selected.length === 1 ? selected[0]
    : `ステータス（${selected.length}件）`

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white',
          selected.length > 0 ? 'border-blue-400 text-blue-700' : 'border-gray-200 text-gray-700'
        )}>
        {label}
        <ChevronDown size={14} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">複数選択できます</span>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])}
                className="text-xs text-blue-600 hover:underline">クリア</button>
            )}
          </div>
          {ALL_STATUSES.map(s => (
            <label key={s} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-blue-50 cursor-pointer select-none">
              <input type="checkbox" checked={selected.includes(s)} onChange={() => toggle(s)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              {s}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ========== Main (inner, uses useSearchParams) ==========
function CustomerListInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>(
    () => (searchParams.get('sf') ?? '').split(',').filter(Boolean)
  )
  const [caFilter, setCaFilter] = useState(searchParams.get('ca') ?? '')
  const [yomiFilter, setYomiFilter] = useState(searchParams.get('yr') ?? '')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [sortBy, setSortBy] = useState(searchParams.get('sb') ?? 'updatedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>((searchParams.get('sd') as 'asc' | 'desc') ?? 'desc')

  // New customer modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [saving, setSaving] = useState(false)

  // CSV
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvRows, setCsvRows] = useState<Record<string, string>[] | null>(null)
  const [csvTotal, setCsvTotal] = useState(0)
  const [csvRawText, setCsvRawText] = useState('')
  const [importing, setImporting] = useState(false)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showBulkStatus, setShowBulkStatus] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  // 状態が変わったらURLに保存
  useEffect(() => {
    const params = new URLSearchParams()
    if (statusFilter.length > 0) params.set('sf', statusFilter.join(','))
    if (caFilter) params.set('ca', caFilter)
    if (yomiFilter) params.set('yr', yomiFilter)
    if (search) params.set('q', search)
    if (sortBy !== 'updatedAt') params.set('sb', sortBy)
    if (sortDir !== 'desc') params.set('sd', sortDir)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [statusFilter, caFilter, yomiFilter, search, sortBy, sortDir, pathname, router])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (statusFilter.length > 0) params.set('status', statusFilter.join(','))
      if (caFilter) params.set('ca', caFilter)
      if (yomiFilter) params.set('yomi', yomiFilter)
      if (search) params.set('search', search)
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
      const res = await fetch(`/api/customers?${params}`)
      if (!res.ok) throw new Error('Failed')
      setCustomers(await res.json() as Customer[])
      setSelected(new Set())
    } catch {
      setError('顧客データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, caFilter, yomiFilter, search, sortBy, sortDir])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <ArrowUpDown size={13} className="text-gray-400 inline ml-1" />
    return sortDir === 'asc' ? <ArrowUp size={13} className="text-blue-500 inline ml-1" /> : <ArrowDown size={13} className="text-blue-500 inline ml-1" />
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
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

  // CSV: ファイル選択 → プレビュー取得
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvRawText(text)
    if (fileRef.current) fileRef.current.value = ''
    // プレビューAPIを呼ぶ
    try {
      const res = await fetch('/api/import?preview=1', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      })
      const data = await res.json()
      if (!res.ok) { alert(`CSVの読み込みに失敗しました: ${data.error}`); return }
      setCsvRows(data.rows)
      setCsvTotal(data.total)
    } catch (err) {
      alert(`エラー: ${err}`)
    }
  }

  // CSV: 確認後に本登録
  const handleImportConfirm = async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: csvRawText,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCsvRows(null)
      alert(`✅ インポート完了\n追加: ${data.added}件\nスキップ(重複): ${data.skipped}件`)
      await fetchCustomers()
    } catch (err) {
      alert(`❌ エラー: ${err}`)
    } finally {
      setImporting(false)
    }
  }

  // 一括削除
  const handleBulkDelete = async () => {
    if (!confirm(`選択した${selected.size}件を削除しますか？この操作は取り消せません。`)) return
    setBulkLoading(true)
    try {
      await fetch('/api/customers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], action: 'delete' }),
      })
      await fetchCustomers()
    } finally {
      setBulkLoading(false)
    }
  }

  // 一括ステータス変更
  const handleBulkStatus = async (status: string) => {
    setBulkLoading(true)
    try {
      await fetch('/api/customers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], action: 'updateStatus', status }),
      })
      setShowBulkStatus(false)
      await fetchCustomers()
    } finally {
      setBulkLoading(false)
    }
  }

  // 次回予定を完了にしてクリア
  const [completingId, setCompletingId] = useState<string | null>(null)
  const handleCompleteNext = async (c: Customer) => {
    if (!c.nextAction && !c.nextDeadline) return
    if (!confirm(`「${c.nextAction || formatDate(c.nextDeadline)}」を完了にして次回予定から消しますか？`)) return
    setCompletingId(c.id)
    // 楽観的更新
    setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, nextAction: null, nextDeadline: null } : x))
    try {
      // 完了記録を履歴に残す（失敗しても致命的ではない）
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: c.id,
          name: c.name,
          ca: c.ca ?? null,
          type: '完了',
          content: `次回アクション「${c.nextAction ?? ''}」を完了`,
        }),
      }).catch(() => {})
      const res = await fetch(`/api/customers/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextAction: null, nextDeadline: null }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      alert('完了処理に失敗しました')
      await fetchCustomers()
    } finally {
      setCompletingId(null)
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === customers.length) setSelected(new Set())
    else setSelected(new Set(customers.map(c => c.id)))
  }

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">顧客一覧</h1>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Upload size={15} />CSVインポート
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-[#0070D2] hover:bg-[#005fb2] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} />新規登録
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="氏名・メール・電話で検索" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <StatusMultiSelect selected={statusFilter} onChange={setStatusFilter} />
        <select value={caFilter} onChange={(e) => setCaFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">すべての担当CA</option>
          {CA_OPTIONS.map(ca => <option key={ca} value={ca}>{ca}</option>)}
        </select>
        <select value={yomiFilter} onChange={(e) => setYomiFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">ヨミランク</option>
          {['S', 'A', 'B', 'C', 'D'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={fetchCustomers}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors">
          検索
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-blue-700 text-white rounded-lg px-4 py-2.5 mb-3 flex items-center gap-4">
          <span className="text-sm font-medium">{selected.size}件選択中</span>
          <button onClick={() => setShowBulkStatus(true)} disabled={bulkLoading}
            className="flex items-center gap-1.5 text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors">
            <Edit size={13} />ステータス一括変更
          </button>
          <button onClick={handleBulkDelete} disabled={bulkLoading}
            className="flex items-center gap-1.5 text-sm bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors ml-auto">
            <Trash2 size={13} />一括削除
          </button>
          <button onClick={() => setSelected(new Set())} className="text-white/70 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="animate-pulse space-y-3">
              {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
            </div>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">{error}</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-gray-400"><p>該当する顧客が見つかりません</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={selected.size === customers.length && customers.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('name')}>氏名<SortIcon col="name" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('status')}>ステータス<SortIcon col="status" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">タスク</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">担当CA</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('registeredAt')}>送客日<SortIcon col="registeredAt" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('firstMeeting')}>初回面談日<SortIcon col="firstMeeting" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">次回アクション</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort('nextDeadline')}>次回期限<SortIcon col="nextDeadline" /></th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">ヨミ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => {
                const overdue = isOverdue(c.nextDeadline)
                const isSelected = selected.has(c.id)
                return (
                  <tr key={c.id} className={cn('hover:bg-blue-50 cursor-pointer transition-colors', isSelected && 'bg-blue-50')}>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900" onClick={() => { window.location.href = `/customers/${c.id}` }}>
                      <Link href={`/customers/${c.id}`} className="hover:text-blue-600" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      {c.kana && <div className="text-xs text-gray-400">{c.kana}</div>}
                    </td>
                    <td className="px-4 py-3" onClick={() => { window.location.href = `/customers/${c.id}` }}><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3" onClick={() => { window.location.href = `/customers/${c.id}` }}><TaskBadge hasOpenTask={(c.tasks?.length ?? 0) > 0} /></td>
                    <td className="px-4 py-3 text-gray-700" onClick={() => { window.location.href = `/customers/${c.id}` }}>{c.ca}</td>
                    <td className="px-4 py-3 text-gray-500" onClick={() => { window.location.href = `/customers/${c.id}` }}>{formatDate(c.registeredAt)}</td>
                    <td className="px-4 py-3 text-gray-500" onClick={() => { window.location.href = `/customers/${c.id}` }}>{c.meetings?.[0]?.date ? formatDate(c.meetings[0].date) : '—'}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px]" onClick={() => { window.location.href = `/customers/${c.id}` }}>
                      <div className="flex items-center gap-2">
                        <span className="truncate">{c.nextAction}</span>
                        {(c.nextAction || c.nextDeadline) && (
                          <button
                            title="完了にして次回予定から消す"
                            disabled={completingId === c.id}
                            onClick={(e) => { e.stopPropagation(); handleCompleteNext(c) }}
                            className="shrink-0 inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-md px-2 py-1 disabled:opacity-50 transition-colors"
                          >
                            <Check size={12} />完了
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={cn('px-4 py-3 font-medium', overdue ? 'text-red-600' : 'text-gray-700')} onClick={() => { window.location.href = `/customers/${c.id}` }}>
                      {formatDate(c.nextDeadline)}
                      {overdue && <span className="ml-1 text-xs">(!)</span>}
                    </td>
                    <td className="px-4 py-3" onClick={() => { window.location.href = `/customers/${c.id}` }}><YomiRankBadge rank={c.yomiRank} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {!loading && !error && customers.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-500">{customers.length}件</div>
        )}
      </div>

      {/* CSV Preview Modal */}
      {csvRows !== null && (
        <CsvPreviewModal
          rows={csvRows}
          total={csvTotal}
          onConfirm={handleImportConfirm}
          onClose={() => setCsvRows(null)}
          importing={importing}
        />
      )}

      {/* Bulk Status Modal */}
      {showBulkStatus && (
        <BulkStatusModal
          count={selected.size}
          onApply={handleBulkStatus}
          onClose={() => setShowBulkStatus(false)}
        />
      )}

      {/* New Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold">新規顧客登録</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <F label="氏名 *"><input required value={form.name} onChange={f('name')} className={inp} /></F>
              <F label="フリガナ"><input value={form.kana} onChange={f('kana')} className={inp} /></F>
              <F label="電話番号"><input value={form.phone} onChange={f('phone')} className={inp} /></F>
              <F label="メールアドレス"><input type="email" value={form.email} onChange={f('email')} className={inp} /></F>
              <F label="担当CA">
                <select value={form.ca} onChange={f('ca')} className={inp}>
                  <option value="">— 選択 —</option>
                  {CA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="流入元">
                <select value={form.inflow} onChange={f('inflow')} className={inp}>
                  <option value="">— 選択 —</option>
                  {INFLOW_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="性別">
                <select value={form.gender} onChange={f('gender')} className={inp}>
                  <option value="">— 選択 —</option>
                  {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="居住地">
                <select value={form.area} onChange={f('area')} className={inp}>
                  <option value="">— 選択 —</option>
                  {PREF_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="現職企業"><input value={form.company} onChange={f('company')} className={inp} /></F>
              <F label="現職職種"><input value={form.job} onChange={f('job')} className={inp} /></F>
              <F label="現在年収（万円）"><input value={form.salary} onChange={f('salary')} placeholder="例: 400" className={inp} /></F>
              <F label="希望職種"><input value={form.hopeJob} onChange={f('hopeJob')} className={inp} /></F>
              <F label="希望勤務地">
                <select value={form.hopeArea} onChange={f('hopeArea')} className={inp}>
                  <option value="">— 選択 —</option>
                  {PREF_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="希望年収（万円）"><input value={form.hopeSalary} onChange={f('hopeSalary')} placeholder="例: 500" className={inp} /></F>
              <F label="転職希望時期">
                <select value={form.timing} onChange={f('timing')} className={inp}>
                  <option value="">— 選択 —</option>
                  {TIMING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="受注予定月">
                <input type="month" value={form.expectedCloseMonth} onChange={f('expectedCloseMonth')} className={inp} />
              </F>
              <F label="備考">
                <textarea value={form.note} onChange={f('note')} rows={3} className={inp + ' resize-none'} />
              </F>
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

export function CustomerListClient() {
  return (
    <Suspense fallback={<div className="max-w-screen-xl mx-auto px-4 py-6"><div className="animate-pulse h-64 bg-white rounded-xl" /></div>}>
      <CustomerListInner />
    </Suspense>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
