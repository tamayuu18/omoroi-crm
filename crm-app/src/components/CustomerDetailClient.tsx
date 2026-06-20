'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import {
  Phone, Mail, MapPin, Briefcase, DollarSign, Calendar,
  ChevronLeft, Edit, Clock, CheckSquare, Users, Trash2, Star, Pencil, X, Check, Download, Camera
} from 'lucide-react'
import type { Customer, Task, Meeting, History } from '@/types'
import { ALL_STATUSES } from '@/types'
import { CA_OPTIONS, ASSIGNEE_OPTIONS, INFLOW_OPTIONS, GENDER_OPTIONS, TIMING_OPTIONS, PREF_OPTIONS } from '@/lib/constants'
import { StatusBadge, YomiRankBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

function fmt(d: Date | string | null | undefined) {
  if (!d) return '—'
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy/MM/dd') } catch { return String(d) }
}

function fmtInput(d: Date | string | null | undefined) {
  if (!d) return ''
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy-MM-dd') } catch { return '' }
}

const PIPELINE_STAGES = [
  '新規送客', '初回連絡済み', '面談予約済み', '面談実施済み',
  '求人提案中', '応募済み', '書類選考中', '一次面接予定',
  '最終面接予定', '内定', '承諾', '入社済み',
]

function getStageIndex(status: string) {
  return PIPELINE_STAGES.indexOf(status)
}

function historyIcon(type: string | null | undefined) {
  if (!type) return '📝'
  if (type.includes('電話')) return '📞'
  if (type.includes('メール')) return '📧'
  if (type.includes('面談')) return '🤝'
  return '📝'
}

interface ModalProps {
  customer: Customer
  onClose: () => void
  onUpdate: () => void
}

// ========== Status Modal ==========
function StatusChangeModal({ customer, onClose, onUpdate }: ModalProps) {
  const [status, setStatus] = useState(customer.status)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    try {
      await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      onUpdate()
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">ステータス変更</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500">
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2] disabled:opacity-50">
            {loading ? '更新中...' : '更新する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== Yomi Modal ==========
function YomiModal({ customer, onClose, onUpdate }: ModalProps) {
  const c = customer as Customer & { expectedRevenue?: string | null; feeRate?: string | null }
  const [yomiRank, setYomiRank] = useState(c.yomiRank ?? '')
  const [expectedRevenue, setExpectedRevenue] = useState(c.expectedRevenue ?? '')
  const [feeRate, setFeeRate] = useState(c.feeRate ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    try {
      await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yomiRank: yomiRank || null,
          expectedRevenue: expectedRevenue || null,
          feeRate: feeRate || null,
        }),
      })
      onUpdate()
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">ヨミ更新</h2>
        <div className="flex gap-2 mb-4">
          {['S', 'A', 'B', 'C', 'D'].map((r) => (
            <button key={r} onClick={() => setYomiRank(r)}
              className={cn('flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-colors',
                yomiRank === r ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
              {r}
            </button>
          ))}
          <button onClick={() => setYomiRank('')}
            className={cn('flex-1 py-2 rounded-lg text-xs border-2 transition-colors',
              yomiRank === '' ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-400 hover:border-gray-300')}>
            なし
          </button>
        </div>
        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">売上予定額（万円）</label>
            <input type="number" value={expectedRevenue} onChange={e => setExpectedRevenue(e.target.value)}
              placeholder="例: 500" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">フィー率（%）</label>
            <input type="number" value={feeRate} onChange={e => setFeeRate(e.target.value)}
              placeholder="例: 30" className={inp} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2] disabled:opacity-50">
            {loading ? '更新中...' : '更新する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== Edit Info Modal ==========
function EditInfoModal({ customer, onClose, onUpdate }: ModalProps) {
  const [form, setForm] = useState({
    name: customer.name ?? '',
    kana: customer.kana ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    age: customer.age ?? '',
    gender: customer.gender ?? '',
    area: customer.area ?? '',
    company: customer.company ?? '',
    job: customer.job ?? '',
    salary: customer.salary ?? '',
    hopeJob: customer.hopeJob ?? '',
    hopeArea: customer.hopeArea ?? '',
    hopeSalary: customer.hopeSalary ?? '',
    timing: customer.timing ?? '',
    inflow: customer.inflow ?? '',
    ca: customer.ca ?? '',
    expectedCloseMonth: (customer as any).expectedCloseMonth ?? '',
    note: customer.note ?? '',
  })
  const [loading, setLoading] = useState(false)

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      onUpdate()
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-bold">基本情報を編集</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <Row label="氏名 *"><input required value={form.name} onChange={f('name')} className={inp} /></Row>
          <Row label="フリガナ"><input value={form.kana} onChange={f('kana')} className={inp} /></Row>
          <Row label="電話番号"><input value={form.phone} onChange={f('phone')} className={inp} /></Row>
          <Row label="メールアドレス"><input type="email" value={form.email} onChange={f('email')} className={inp} /></Row>
          <Row label="年齢"><input value={form.age} onChange={f('age')} placeholder="例: 28" className={inp} /></Row>
          <Row label="性別">
            <select value={form.gender} onChange={f('gender')} className={inp}>
              <option value="">— 選択 —</option>
              {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="担当CA">
            <select value={form.ca} onChange={f('ca')} className={inp}>
              <option value="">— 選択 —</option>
              {CA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="流入元">
            <select value={form.inflow} onChange={f('inflow')} className={inp}>
              <option value="">— 選択 —</option>
              {INFLOW_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="居住地">
            <select value={form.area} onChange={f('area')} className={inp}>
              <option value="">— 選択 —</option>
              {PREF_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="現職企業"><input value={form.company} onChange={f('company')} className={inp} /></Row>
          <Row label="現職職種"><input value={form.job} onChange={f('job')} className={inp} /></Row>
          <Row label="現在年収（万円）"><input value={form.salary} onChange={f('salary')} placeholder="例: 400" className={inp} /></Row>
          <Row label="希望職種"><input value={form.hopeJob} onChange={f('hopeJob')} className={inp} /></Row>
          <Row label="希望勤務地">
            <select value={form.hopeArea} onChange={f('hopeArea')} className={inp}>
              <option value="">— 選択 —</option>
              {PREF_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="希望年収（万円）"><input value={form.hopeSalary} onChange={f('hopeSalary')} placeholder="例: 500" className={inp} /></Row>
          <Row label="転職希望時期">
            <select value={form.timing} onChange={f('timing')} className={inp}>
              <option value="">— 選択 —</option>
              {TIMING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="受注予定月">
            <input type="month" value={form.expectedCloseMonth} onChange={f('expectedCloseMonth')} className={inp} />
          </Row>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
            <textarea value={form.note} onChange={f('note')} rows={3} className={inp + ' resize-none'} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">キャンセル</button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#0070D2] text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {loading ? '保存中...' : '保存する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Lreachヒアリングメモのパーサー
function parseLreachText(text: string): Record<string, string> {
  const fieldMap: [RegExp, string][] = [
    [/^(名前|氏名)\s*[：:]\s*(.+)/, 'name'],
    [/^(ふりがな|フリガナ)\s*[：:]\s*(.+)/, 'kana'],
    [/^性別\s*[：:]\s*(.+)/, 'gender'],
    [/^(電話番号|TEL|Tel)\s*[：:]\s*(.+)/, 'phone'],
    [/^(アドレス|メール|メールアドレス|email)\s*[：:]\s*(.+)/i, 'email'],
    [/^(所在地|住所|居住地)\s*[：:]\s*(.+)/, 'area'],
    [/^希望勤務地\s*[：:]\s*(.+)/, 'hopeArea'],
    [/^(現在の職種|現職種|現職職種|職種)\s*[：:]\s*(.+)/, 'job'],
    [/^(現職企業|会社名|企業名|現勤務先)\s*[：:]\s*(.+)/, 'company'],
    [/^(現在年収|現在の年収|年収)\s*[：:]\s*(.+)/, 'salary'],
    [/^希望年収\s*[：:]\s*(.+)/, 'hopeSalary'],
    [/^希望職種\s*[：:]\s*(.+)/, 'hopeJob'],
    [/^(転職希望時期|転職時期|希望転職時期)\s*[：:]\s*(.+)/, 'timing'],
  ]
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    for (const [pattern, field] of fieldMap) {
      const m = trimmed.match(pattern)
      if (m) {
        result[field] = (m[2] ?? m[1]).trim()
        break
      }
    }
  }
  // 年収の「万円」「万」を除去して数値のみに
  if (result.salary) result.salary = result.salary.replace(/万円?/, '').trim()
  if (result.hopeSalary) result.hopeSalary = result.hopeSalary.replace(/万円?/, '').trim()
  return result
}

const FIELD_LABELS: Record<string, string> = {
  name: '氏名', kana: 'フリガナ', gender: '性別', phone: '電話番号', email: 'メール',
  area: '居住地', hopeArea: '希望勤務地', job: '現職職種', company: '現職企業',
  salary: '現在年収（万円）', hopeSalary: '希望年収（万円）', hopeJob: '希望職種', timing: '転職希望時期',
}

// ========== Lreach Import Modal ==========
function LreachImportModal({ customer, onClose, onUpdate }: ModalProps) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(false)

  function handleParse() {
    const result = parseLreachText(text)
    if (Object.keys(result).length === 0) {
      alert('フィールドを読み取れませんでした。Lreachのヒアリングメモをそのまま貼り付けてください。')
      return
    }
    setParsed(result)
  }

  async function handleSave() {
    if (!parsed) return
    setLoading(true)
    try {
      await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      onUpdate()
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-bold">Lreach情報を取込</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {!parsed ? (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-500">Lreachのヒアリングメモをそのまま貼り付けてください。</p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={14}
              placeholder={'名前 ： 山田 太郎\nふりがな ： やまだ たろう\n電話番号 ： 09012345678\nアドレス ： example@gmail.com\n...'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
              <button onClick={handleParse} disabled={!text.trim()}
                className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg disabled:opacity-50">
                内容を確認する
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-600 font-medium">以下の内容で顧客情報を上書きします:</p>
            <div className="border rounded-lg overflow-hidden text-sm">
              {Object.entries(parsed).map(([key, val]) => (
                <div key={key} className="flex border-b last:border-b-0">
                  <span className="w-36 shrink-0 bg-gray-50 px-3 py-2 text-gray-500 text-xs font-medium border-r">
                    {FIELD_LABELS[key] ?? key}
                  </span>
                  <span className="px-3 py-2 text-gray-800 flex-1">{val}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setParsed(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">戻る</button>
              <button onClick={handleSave} disabled={loading}
                className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg disabled:opacity-50">
                {loading ? '更新中...' : '更新する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ========== Add Task Modal ==========
function AddTaskModal({ customer, onClose, onUpdate }: ModalProps) {
  const [content, setContent] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState('中')
  const [assignee, setAssignee] = useState(customer.ca ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!content.trim()) return
    setLoading(true)
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          name: customer.name,
          ca: customer.ca,
          assignee,
          content,
          deadline,
          priority,
        }),
      })
      onUpdate()
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">タスクを追加</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">タスク内容 *</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3}
              placeholder="例: 求人票3件送付する" className={inp + ' resize-none'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">作業担当者</label>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inp}>
              <option value="">— 選択 —</option>
              {ASSIGNEE_OPTIONS.map(ca => <option key={ca} value={ca}>{ca}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">期限</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inp}>
              {['高', '中', '低'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
          <button onClick={handleSubmit} disabled={loading || !content.trim()}
            className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2] disabled:opacity-50">
            {loading ? '追加中...' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== Add History Modal ==========
function AddHistoryModal({ customer, onClose, onUpdate }: ModalProps) {
  const [type, setType] = useState('電話')
  const [result, setResult] = useState('')
  const [content, setContent] = useState('')
  const [nextContent, setNextContent] = useState('')
  const [nextDeadline, setNextDeadline] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    try {
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          name: customer.name,
          ca: customer.ca,
          date: new Date().toISOString().split('T')[0],
          type, result, content, nextContent, nextDeadline,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('保存に失敗しました: ' + (err.error ?? res.status))
        return
      }
      onUpdate()
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">対応記録を追加</h2>
        <div className="space-y-3">
          <Row label="対応種別">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inp}>
              {['電話', 'メール', '面談', 'その他'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Row>
          <Row label="対応結果">
            <input value={result} onChange={(e) => setResult(e.target.value)} placeholder="例: 折り返し約束" className={inp} />
          </Row>
          <Row label="対応内容 *">
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4}
              placeholder="対応内容を記入..." className={inp + ' resize-none'} />
          </Row>
          <Row label="次回予定">
            <input value={nextContent} onChange={(e) => setNextContent(e.target.value)} placeholder="次回の対応内容" className={inp} />
          </Row>
          <Row label="次回期限">
            <input type="date" value={nextDeadline} onChange={(e) => setNextDeadline(e.target.value)} className={inp} />
          </Row>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
          <button onClick={handleSubmit} disabled={loading || !content}
            className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2] disabled:opacity-50">
            {loading ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== Inline History Item ==========
function HistoryItem({ h, onUpdate }: { h: History; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({
    type: h.type ?? '電話',
    date: fmtInput(h.date),
    result: h.result ?? '',
    content: h.content ?? '',
    nextContent: h.nextContent ?? '',
    nextDeadline: fmtInput(h.nextDeadline),
  })
  const [loading, setLoading] = useState(false)

  const contentLines = (h.content ?? '').split('\n')
  const isLong = contentLines.length > 3 || (h.content ?? '').length > 120
  const previewText = isLong && !expanded
    ? contentLines.slice(0, 3).join('\n').slice(0, 120)
    : (h.content ?? '')

  async function handleSave() {
    setLoading(true)
    try {
      await fetch(`/api/history/item/${h.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      onUpdate()
      setEditing(false)
    } finally { setLoading(false) }
  }

  async function handleDelete() {
    if (!confirm('この対応記録を削除しますか？')) return
    await fetch(`/api/history/item/${h.id}`, { method: 'DELETE' })
    onUpdate()
  }

  if (editing) {
    return (
      <div className="border border-blue-200 rounded-lg p-3 text-sm bg-blue-50 space-y-2">
        <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className={inp}>
          {['電話', 'メール', '面談', 'その他'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
          className={inp} />
        <input value={form.result} onChange={(e) => setForm(f => ({ ...f, result: e.target.value }))}
          placeholder="対応結果" className={inp} />
        <textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
          rows={3} className={inp + ' resize-none'} />
        <input value={form.nextContent} onChange={(e) => setForm(f => ({ ...f, nextContent: e.target.value }))}
          placeholder="次回予定" className={inp} />
        <input type="date" value={form.nextDeadline} onChange={(e) => setForm(f => ({ ...f, nextDeadline: e.target.value }))} className={inp} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
            <X size={12} />キャンセル
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#0070D2] text-white rounded-lg disabled:opacity-50">
            <Check size={12} />{loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 group">
      <div className="text-xl shrink-0 mt-0.5">{historyIcon(h.type)}</div>
      <div className="flex-1 border border-gray-100 rounded-lg p-3 text-sm">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium text-gray-800">{h.type}</span>
          {h.result && <span className="text-gray-500 text-xs">— {h.result}</span>}
          <span className="text-xs text-gray-400 ml-auto">{fmt(h.date)} / {h.ca}{h.createdBy && ` / 記録: ${h.createdBy}`}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500">
              <Pencil size={12} />
            </button>
            <button onClick={handleDelete} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {h.content && (
          <div>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
              {previewText}{isLong && !expanded && '…'}
            </p>
            {isLong && (
              <button onClick={() => setExpanded(e => !e)}
                className="text-xs text-blue-500 hover:text-blue-700 mt-1">
                {expanded ? '▲ 折りたたむ' : '▼ 続きを見る'}
              </button>
            )}
          </div>
        )}
        {h.nextContent && (
          <p className="text-xs text-blue-600 mt-1.5">
            次回: {h.nextContent}{h.nextDeadline && ` (${fmt(h.nextDeadline)})`}
          </p>
        )}
      </div>
    </div>
  )
}

// ========== Inline Task Item ==========
function TaskItem({ t, onUpdate }: { t: Task; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    content: t.content ?? '',
    assignee: (t as any).assignee ?? '',
    deadline: fmtInput(t.deadline),
    priority: t.priority ?? '中',
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      await fetch(`/api/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      onUpdate()
      setEditing(false)
    } finally { setLoading(false) }
  }

  async function handleDelete() {
    if (!confirm('このタスクを削除しますか？')) return
    await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' })
    onUpdate()
  }

  async function toggleStatus() {
    const newStatus = t.status === '完了' ? '未完了' : '完了'
    await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    onUpdate()
  }

  if (editing) {
    return (
      <div className="border border-blue-200 rounded-lg p-3 text-sm bg-blue-50 space-y-2">
        <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          rows={2} className={inp + ' resize-none'} placeholder="タスク内容" />
        <select value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))} className={inp}>
          <option value="">— 作業担当者 —</option>
          {ASSIGNEE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} className={inp} />
        <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inp}>
          {['高', '中', '低'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={handleDelete} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg border border-red-200">削除</button>
          <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
            <X size={12} />キャンセル
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#0070D2] text-white rounded-lg disabled:opacity-50">
            <Check size={12} />{loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg text-sm group hover:bg-gray-50">
      <button onClick={toggleStatus} className="mt-0.5 shrink-0">
        <CheckSquare size={18} className={t.status === '完了' ? 'text-green-500' : 'text-gray-300'} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium', t.status === '完了' && 'line-through text-gray-400')}>{t.content}</p>
        <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
          <span>期限: {fmt(t.deadline)}</span>
          <span>優先度: {t.priority}</span>
          {(t as any).assignee && <span>担当: {(t as any).assignee}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className={cn('shrink-0 text-xs px-2 py-0.5 rounded-full',
          t.status === '完了' ? 'bg-green-100 text-green-700' : 'bg-yellow-50 text-yellow-700')}>
          {t.status}
        </span>
        <button onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 transition-opacity">
          <Pencil size={12} />
        </button>
      </div>
    </div>
  )
}

// ========== Main Component ==========
export function CustomerDetailClient({ customerId }: { customerId: string }) {
  const router = useRouter()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [tab, setTab] = useState<'all' | 'history' | 'tasks' | 'meetings'>('all')
  const [loading, setLoading] = useState(true)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showYomiModal, setShowYomiModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showLreachModal, setShowLreachModal] = useState(false)
  const [editingRecommendation, setEditingRecommendation] = useState(false)
  const [recommendationText, setRecommendationText] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const nc = { cache: 'no-store' as const }
      const [cRes, tRes, mRes, hRes] = await Promise.all([
        fetch(`/api/customers/${customerId}`, nc),
        fetch(`/api/tasks?customerId=${customerId}`, nc),
        fetch(`/api/meetings?customerId=${customerId}`, nc),
        fetch(`/api/history/${customerId}`, nc),
      ])
      if (cRes.ok) setCustomer(await cRes.json())
      if (tRes.ok) setTasks(await tRes.json())
      if (mRes.ok) setMeetings(await mRes.json())
      if (hRes.ok) {
        const h = await hRes.json() as History[]
        setHistory(h.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
      }
    } finally { setLoading(false) }
  }, [customerId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function toggleTaskStatus(task: Task) {
    const newStatus = task.status === '完了' ? '未完了' : '完了'
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  async function handleDelete() {
    if (!customer) return
    if (!confirm(`「${customer.name}」を削除しますか？この操作は取り消せません。`)) return
    await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' })
    window.location.href = '/customers'
  }

  if (loading) {
    return (
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="max-w-screen-xl mx-auto px-4 py-6 text-center text-gray-500">
        <p>顧客が見つかりません</p>
        <Link href="/customers" className="text-blue-500 hover:underline mt-2 inline-block">顧客一覧に戻る</Link>
      </div>
    )
  }

  const stageIndex = getStageIndex(customer.status)

  // すべてタブ: 履歴+タスク+面談を日付順でマージ
  type AllItem =
    | { kind: 'history'; data: History }
    | { kind: 'task'; data: Task }
    | { kind: 'meeting'; data: Meeting }

  const allItems: AllItem[] = [
    ...history.map(d => ({ kind: 'history' as const, data: d })),
    ...tasks.map(d => ({ kind: 'task' as const, data: d })),
    ...meetings.map(d => ({ kind: 'meeting' as const, data: d })),
  ].sort((a, b) => {
    const dateA = a.kind === 'history' ? new Date(a.data.date).getTime()
      : a.kind === 'task' ? new Date(a.data.deadline ?? 0).getTime()
      : new Date((a.data as Meeting).date ?? 0).getTime()
    const dateB = b.kind === 'history' ? new Date(b.data.date).getTime()
      : b.kind === 'task' ? new Date(b.data.deadline ?? 0).getTime()
      : new Date((b.data as Meeting).date ?? 0).getTime()
    return dateB - dateA
  })

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 w-fit">
        <ChevronLeft size={16} />顧客一覧に戻る
      </button>

      {/* Top card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div className="flex items-start gap-4">
            {/* 証明写真 */}
            <label className="shrink-0 cursor-pointer group relative">
              <div className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50 group-hover:border-blue-400 transition-colors">
                {(customer as any).photoUrl ? (
                  <img src={(customer as any).photoUrl} alt="証明写真" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-blue-400 transition-colors">
                    <Camera size={20} />
                    <span className="text-[9px]">写真</span>
                  </div>
                )}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.size > 2 * 1024 * 1024) { alert('2MB以下の画像を選択してください'); return }
                const reader = new FileReader()
                reader.onload = async () => {
                  const dataUrl = reader.result as string
                  await fetch(`/api/customers/${customerId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ photoUrl: dataUrl }),
                  })
                  setCustomer(prev => prev ? { ...prev, photoUrl: dataUrl } as any : prev)
                }
                reader.readAsDataURL(file)
              }} />
            </label>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              {customer.kana && <p className="text-sm text-gray-400">{customer.kana}</p>}
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <StatusBadge status={customer.status} size="md" />
                {customer.yomiRank && <YomiRankBadge rank={customer.yomiRank} />}
                <span className="text-sm text-gray-500">担当: {customer.ca || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowStatusModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#0070D2] text-white rounded-lg text-sm hover:bg-[#005fb2] transition-colors">
              <Edit size={14} />ステータス変更
            </button>
            <button onClick={() => setShowYomiModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              <Star size={14} />ヨミ更新
            </button>
            <button onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              <Clock size={14} />対応記録を追加
            </button>
            <button onClick={() => setShowLreachModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50 transition-colors">
              <Download size={14} />Lreach取込
            </button>
            <button onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors">
              <Trash2 size={14} />削除
            </button>
          </div>
        </div>

        {stageIndex >= 0 && (
          <div className="mt-5 overflow-x-auto">
            <div className="flex items-center gap-0 min-w-[600px]">
              {PIPELINE_STAGES.map((stage, i) => (
                <div key={stage} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={cn('w-3 h-3 rounded-full border-2 transition-all',
                      i < stageIndex ? 'bg-[#0070D2] border-[#0070D2]'
                      : i === stageIndex ? 'bg-[#0070D2] border-[#0070D2] ring-2 ring-blue-200 scale-125'
                      : 'bg-white border-gray-300')} />
                    <span className={cn('text-[9px] mt-1 text-center leading-tight',
                      i === stageIndex ? 'text-blue-600 font-bold' : 'text-gray-400')}>{stage}</span>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div className={cn('h-0.5 flex-1 -mt-3', i < stageIndex ? 'bg-[#0070D2]' : 'bg-gray-200')} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Info card */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3 text-sm">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="font-bold text-gray-700">基本情報</h2>
            <button onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors">
              <Pencil size={12} />編集
            </button>
          </div>
          <InfoRow icon={<Phone size={14} />} label="電話" value={customer.phone} />
          <InfoRow icon={<Mail size={14} />} label="メール" value={customer.email} />
          <InfoRow icon={<Users size={14} />} label="年齢・性別" value={[customer.age && `${customer.age}歳`, customer.gender].filter(Boolean).join(' / ')} />
          <InfoRow icon={<MapPin size={14} />} label="居住地" value={customer.area} />
          <InfoRow icon={<Briefcase size={14} />} label="現職企業" value={customer.company} />
          <InfoRow icon={<Briefcase size={14} />} label="現職職種" value={customer.job} />
          <InfoRow icon={<DollarSign size={14} />} label="現在年収" value={customer.salary && `${customer.salary}万円`} />

          <h2 className="font-bold text-gray-700 border-b pb-2 pt-2">希望条件</h2>
          <InfoRow icon={<Briefcase size={14} />} label="希望職種" value={customer.hopeJob} />
          <InfoRow icon={<MapPin size={14} />} label="希望勤務地" value={customer.hopeArea} />
          <InfoRow icon={<DollarSign size={14} />} label="希望年収" value={customer.hopeSalary && `${customer.hopeSalary}万円`} />
          <InfoRow icon={<Calendar size={14} />} label="転職希望時期" value={customer.timing} />

          <h2 className="font-bold text-gray-700 border-b pb-2 pt-2">ヨミ情報</h2>
          <InfoRow icon={<Star size={14} />} label="ヨミランク" value={customer.yomiRank} />
          <InfoRow icon={<DollarSign size={14} />} label="売上予定額" value={(customer as any).expectedRevenue && `${(customer as any).expectedRevenue}万円`} />
          <InfoRow icon={<DollarSign size={14} />} label="フィー率" value={(customer as any).feeRate && `${(customer as any).feeRate}%`} />

          <h2 className="font-bold text-gray-700 border-b pb-2 pt-2">その他</h2>
          <InfoRow icon={<Calendar size={14} />} label="流入元" value={customer.inflow} />
          <InfoRow icon={<Calendar size={14} />} label="登録日" value={fmt(customer.registeredAt)} />
          <InfoRow icon={<Calendar size={14} />} label="最終更新日" value={fmt(customer.updatedAt)} />
          <InfoRow icon={<Calendar size={14} />} label="最終対応日" value={fmt(customer.lastContact)} />
          {customer.nextAction && (
            <div className="pt-1 bg-blue-50 rounded-lg p-2">
              <p className="text-xs text-blue-700 font-medium">次回: {customer.nextAction}</p>
              {customer.nextDeadline && <p className="text-xs text-blue-500">{fmt(customer.nextDeadline)}</p>}
            </div>
          )}
          {customer.note && (
            <div className="pt-2">
              <p className="text-xs text-gray-500 font-medium mb-1">備考</p>
              <p className="text-gray-700 text-xs leading-relaxed whitespace-pre-wrap">{customer.note}</p>
            </div>
          )}
        </div>

        {/* Right: Tabs */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200">
            {([
              { key: 'all', label: 'すべて', count: allItems.length },
              { key: 'history', label: '活動履歴', count: history.length },
              { key: 'tasks', label: 'タスク', count: tasks.length },
              { key: 'meetings', label: '面談', count: meetings.length },
            ] as const).map(({ key, label, count }) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn('px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  tab === key ? 'border-[#0070D2] text-[#0070D2]' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                {label}
                {count > 0 && <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">{count}</span>}
              </button>
            ))}
          </div>

          <div className="p-4 overflow-y-auto max-h-[600px]">
            {/* すべてタブ */}
            {tab === 'all' && (
              allItems.length === 0 ? <EmptyState message="記録がありません" /> : (
                <div className="space-y-3">
                  {allItems.map((item) => {
                    if (item.kind === 'history') {
                      return <HistoryItem key={`h-${item.data.id}`} h={item.data} onUpdate={fetchAll} />
                    }
                    if (item.kind === 'task') {
                      return <TaskItem key={`t-${item.data.id}`} t={item.data} onUpdate={fetchAll} />
                    }
                    const m = item.data as Meeting
                    return (
                      <div key={`m-${m.id}`} className="border border-gray-100 rounded-lg p-3 text-sm bg-blue-50/30">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">🤝</span>
                          <span className="font-medium text-gray-800">面談</span>
                          <span className="text-xs text-gray-500">{fmt(m.date)} {m.startTime && `${m.startTime}〜${m.endTime}`}</span>
                          <span className={cn('ml-auto text-xs px-2 py-0.5 rounded-full',
                            m.status === '完了' ? 'bg-green-100 text-green-700'
                            : m.status === 'キャンセル' ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700')}>{m.status}</span>
                        </div>
                        {m.result && <p className="text-xs text-gray-600 ml-8">結果: {m.result}</p>}
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* 活動履歴タブ */}
            {tab === 'history' && (
              history.length === 0 ? <EmptyState message="活動履歴がありません" /> : (
                <div className="space-y-3">
                  {history.map((h) => <HistoryItem key={h.id} h={h} onUpdate={fetchAll} />)}
                </div>
              )
            )}

            {/* タスクタブ */}
            {tab === 'tasks' && (
              <div>
                <div className="flex justify-end mb-3">
                  <button onClick={() => setShowTaskModal(true)}
                    className="flex items-center gap-1.5 text-sm bg-[#0070D2] text-white px-3 py-1.5 rounded-lg hover:bg-[#005fb2] transition-colors">
                    <span className="text-base leading-none">+</span> タスクを追加
                  </button>
                </div>
              {tasks.length === 0 ? <EmptyState message="タスクがありません" /> : (
                <div className="space-y-2">
                  {tasks.map((t) => <TaskItem key={t.id} t={t} onUpdate={fetchAll} />)}
                </div>
              )}
              </div>
            )}

            {/* 面談タブ */}
            {tab === 'meetings' && (
              meetings.length === 0 ? <EmptyState message="面談記録がありません" /> : (
                <div className="space-y-3">
                  {meetings.map((m) => (
                    <div key={m.id} className="border border-gray-100 rounded-lg p-4 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">
                          {fmt(m.date)} {m.startTime && `${m.startTime}〜${m.endTime}`}
                        </div>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full',
                          m.status === '完了' ? 'bg-green-100 text-green-700'
                          : m.status === 'キャンセル' ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700')}>{m.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>方法: {m.method}</div>
                        <div>温度感: {m.temp}</div>
                        {m.result && <div className="col-span-2">結果: {m.result}</div>}
                        {m.nextAction && <div className="col-span-2 text-blue-600">次回: {m.nextAction} ({fmt(m.nextDeadline)})</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* 推薦文セクション */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-700 flex items-center gap-2">
            <span>📝</span> 推薦文
          </h2>
          {!editingRecommendation && (
            <button
              onClick={() => { setRecommendationText((customer as any).recommendation ?? ''); setEditingRecommendation(true) }}
              className="text-xs text-blue-600 hover:underline"
            >
              {(customer as any).recommendation ? '編集' : '+ 追加'}
            </button>
          )}
        </div>
        {editingRecommendation ? (
          <div className="space-y-2">
            <textarea
              value={recommendationText}
              onChange={e => setRecommendationText(e.target.value)}
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="推薦文を入力してください..."
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingRecommendation(false)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={async () => {
                  await fetch(`/api/customers/${customerId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recommendation: recommendationText }),
                  })
                  setCustomer(prev => prev ? { ...prev, recommendation: recommendationText } as any : prev)
                  setEditingRecommendation(false)
                }}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          (customer as any).recommendation ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{(customer as any).recommendation}</p>
          ) : (
            <p className="text-sm text-gray-400">推薦文が未登録です。「+ 追加」から入力してください。</p>
          )
        )}
      </div>

      {showStatusModal && <StatusChangeModal customer={customer} onClose={() => setShowStatusModal(false)} onUpdate={fetchAll} />}
      {showYomiModal && <YomiModal customer={customer} onClose={() => setShowYomiModal(false)} onUpdate={fetchAll} />}
      {showHistoryModal && <AddHistoryModal customer={customer} onClose={() => setShowHistoryModal(false)} onUpdate={fetchAll} />}
      {showEditModal && <EditInfoModal customer={customer} onClose={() => setShowEditModal(false)} onUpdate={fetchAll} />}
      {showTaskModal && <AddTaskModal customer={customer} onClose={() => setShowTaskModal(false)} onUpdate={fetchAll} />}
      {showLreachModal && <LreachImportModal customer={customer} onClose={() => setShowLreachModal(false)} onUpdate={fetchAll} />}
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 text-gray-700">
      <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
      <span className="text-gray-500 shrink-0 w-20 text-xs pt-0.5">{label}</span>
      <span className="flex-1 text-xs">{value}</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-gray-400 text-sm">{message}</div>
}
