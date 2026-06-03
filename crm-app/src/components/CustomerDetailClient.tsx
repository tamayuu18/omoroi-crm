'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import {
  Phone, Mail, MapPin, Briefcase, DollarSign, Calendar,
  ChevronLeft, Edit, Clock, CheckSquare, Users
} from 'lucide-react'
import type { Customer, Task, Meeting, History } from '@/types'
import { ALL_STATUSES } from '@/types'
import { StatusBadge, YomiRankBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

function fmt(d: string) {
  if (!d) return '—'
  try { return format(parseISO(d), 'yyyy/MM/dd') } catch { return d }
}

function fmtDatetime(d: string) {
  if (!d) return '—'
  try { return format(parseISO(d), 'yyyy/MM/dd HH:mm') } catch { return d }
}

// Pipeline stages for progress bar
const PIPELINE_STAGES = [
  '新規送客', '初回連絡済み', '面談予約済み', '面談実施済み',
  '求人提案中', '応募済み', '書類選考中', '一次面接予定',
  '最終面接予定', '内定', '承諾', '入社済み',
]

function getStageIndex(status: string) {
  const idx = PIPELINE_STAGES.indexOf(status)
  return idx === -1 ? -1 : idx
}

// History icon
function historyIcon(type: string) {
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">ステータス変更</h2>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">新しいステータス</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2] disabled:opacity-50"
          >
            {loading ? '更新中...' : '更新する'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          name: customer.name,
          ca: customer.ca,
          date: new Date().toISOString().split('T')[0],
          type,
          result,
          content,
          nextContent,
          nextDeadline,
        }),
      })
      onUpdate()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">対応記録を追加</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対応種別</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['電話', 'メール', '面談', 'その他'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対応結果</label>
            <input
              type="text"
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="例: 折り返し約束"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対応内容 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="対応内容を記入..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">次回予定</label>
            <input
              type="text"
              value={nextContent}
              onChange={(e) => setNextContent(e.target.value)}
              placeholder="次回の対応内容"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">次回期限</label>
            <input
              type="date"
              value={nextDeadline}
              onChange={(e) => setNextDeadline(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !content}
            className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2] disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CustomerDetailClient({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [tab, setTab] = useState<'history' | 'tasks' | 'meetings'>('history')
  const [loading, setLoading] = useState(true)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, tRes, mRes, hRes] = await Promise.all([
        fetch(`/api/customers/${customerId}`),
        fetch(`/api/tasks?customerId=${customerId}`),
        fetch(`/api/meetings?customerId=${customerId}`),
        fetch(`/api/history/${customerId}`),
      ])
      if (cRes.ok) setCustomer(await cRes.json())
      if (tRes.ok) setTasks(await tRes.json())
      if (mRes.ok) setMeetings(await mRes.json())
      if (hRes.ok) setHistory((await hRes.json() as History[]).sort((a, b) => b.date.localeCompare(a.date)))
    } finally {
      setLoading(false)
    }
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
        <Link href="/customers" className="text-blue-500 hover:underline mt-2 inline-block">
          顧客一覧に戻る
        </Link>
      </div>
    )
  }

  const stageIndex = getStageIndex(customer.status)

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-4">
      {/* Back nav */}
      <Link href="/customers" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 w-fit">
        <ChevronLeft size={16} />
        顧客一覧に戻る
      </Link>

      {/* Top card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            {customer.kana && <p className="text-sm text-gray-400">{customer.kana}</p>}
            <div className="flex flex-wrap gap-2 mt-2 items-center">
              <StatusBadge status={customer.status} size="md" />
              {customer.yomiRank && <YomiRankBadge rank={customer.yomiRank} />}
              <span className="text-sm text-gray-500">担当: {customer.ca || '—'}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowStatusModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#0070D2] text-white rounded-lg text-sm hover:bg-[#005fb2] transition-colors"
            >
              <Edit size={14} />
              ステータス変更
            </button>
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Clock size={14} />
              対応記録を追加
            </button>
          </div>
        </div>

        {/* Pipeline progress */}
        {stageIndex >= 0 && (
          <div className="mt-5 overflow-x-auto">
            <div className="flex items-center gap-0 min-w-[600px]">
              {PIPELINE_STAGES.map((stage, i) => (
                <div key={stage} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={cn(
                        'w-3 h-3 rounded-full border-2 transition-all',
                        i < stageIndex
                          ? 'bg-[#0070D2] border-[#0070D2]'
                          : i === stageIndex
                          ? 'bg-[#0070D2] border-[#0070D2] ring-2 ring-blue-200 scale-125'
                          : 'bg-white border-gray-300'
                      )}
                    />
                    <span className={cn('text-[9px] mt-1 text-center leading-tight', i === stageIndex ? 'text-blue-600 font-bold' : 'text-gray-400')}>
                      {stage}
                    </span>
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
          <h2 className="font-bold text-gray-700 border-b pb-2">基本情報</h2>
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

          <h2 className="font-bold text-gray-700 border-b pb-2 pt-2">その他</h2>
          <InfoRow icon={<Calendar size={14} />} label="流入元" value={customer.inflow} />
          <InfoRow icon={<Calendar size={14} />} label="登録日" value={fmt(customer.registeredAt)} />
          <InfoRow icon={<Calendar size={14} />} label="最終更新日" value={fmt(customer.updatedAt)} />
          <InfoRow icon={<Calendar size={14} />} label="最終対応日" value={fmt(customer.lastContact)} />
          {customer.note && (
            <div className="pt-2">
              <p className="text-xs text-gray-500 font-medium mb-1">備考</p>
              <p className="text-gray-700 text-xs leading-relaxed whitespace-pre-wrap">{customer.note}</p>
            </div>
          )}
        </div>

        {/* Right: Tabs */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Tab headers */}
          <div className="flex border-b border-gray-200">
            {([
              { key: 'history', label: '活動履歴', count: history.length },
              { key: 'tasks', label: 'タスク', count: tasks.length },
              { key: 'meetings', label: '面談', count: meetings.length },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                  tab === key
                    ? 'border-[#0070D2] text-[#0070D2]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {label}
                {count > 0 && (
                  <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-4 overflow-y-auto max-h-[600px]">
            {/* Activity History Tab */}
            {tab === 'history' && (
              <div>
                {history.length === 0 ? (
                  <EmptyState message="活動履歴がありません" />
                ) : (
                  <div className="space-y-3">
                    {history.map((h) => (
                      <div key={h.id} className="flex gap-3">
                        <div className="text-xl shrink-0 mt-0.5">{historyIcon(h.type)}</div>
                        <div className="flex-1 border border-gray-100 rounded-lg p-3 text-sm">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-gray-800">{h.type}</span>
                            {h.result && <span className="text-gray-500 text-xs">— {h.result}</span>}
                            <span className="text-xs text-gray-400 ml-auto">{fmt(h.date)} / {h.ca}</span>
                          </div>
                          {h.content && <p className="text-gray-700 leading-relaxed">{h.content}</p>}
                          {h.nextContent && (
                            <p className="text-xs text-blue-600 mt-1.5">
                              次回: {h.nextContent}
                              {h.nextDeadline && ` (${fmt(h.nextDeadline)})`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tasks Tab */}
            {tab === 'tasks' && (
              <div>
                {tasks.length === 0 ? (
                  <EmptyState message="タスクがありません" />
                ) : (
                  <div className="space-y-2">
                    {tasks.map((t) => (
                      <div key={t.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg text-sm">
                        <button onClick={() => toggleTaskStatus(t)} className="mt-0.5 shrink-0">
                          <CheckSquare
                            size={18}
                            className={t.status === '完了' ? 'text-green-500' : 'text-gray-300'}
                          />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-medium', t.status === '完了' && 'line-through text-gray-400')}>
                            {t.content}
                          </p>
                          <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                            <span>期限: {fmt(t.deadline)}</span>
                            <span>優先度: {t.priority}</span>
                            <span>{t.ca}</span>
                          </div>
                        </div>
                        <span className={cn(
                          'shrink-0 text-xs px-2 py-0.5 rounded-full',
                          t.status === '完了' ? 'bg-green-100 text-green-700' : 'bg-yellow-50 text-yellow-700'
                        )}>
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Meetings Tab */}
            {tab === 'meetings' && (
              <div>
                {meetings.length === 0 ? (
                  <EmptyState message="面談記録がありません" />
                ) : (
                  <div className="space-y-3">
                    {meetings.map((m) => (
                      <div key={m.id} className="border border-gray-100 rounded-lg p-4 text-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-gray-900">
                            {fmt(m.date)} {m.startTime && `${m.startTime}〜${m.endTime}`}
                          </div>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            m.status === '完了' ? 'bg-green-100 text-green-700'
                            : m.status === 'キャンセル' ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                          )}>
                            {m.status}
                          </span>
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
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showStatusModal && customer && (
        <StatusChangeModal
          customer={customer}
          onClose={() => setShowStatusModal(false)}
          onUpdate={fetchAll}
        />
      )}
      {showHistoryModal && customer && (
        <AddHistoryModal
          customer={customer}
          onClose={() => setShowHistoryModal(false)}
          onUpdate={fetchAll}
        />
      )}
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
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
  return (
    <div className="py-12 text-center text-gray-400 text-sm">{message}</div>
  )
}
