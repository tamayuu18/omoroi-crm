'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, ExternalLink, Link2, Copy, Check, Calendar, ArrowUp, ArrowDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Job, JobProposalWithJob } from '@/types'
import { PROPOSAL_STATUS_OPTIONS, PROPOSAL_OFFER_STATUSES } from '@/lib/constants'
import { JobFormModal } from '@/components/JobFormModal'
import { cn } from '@/lib/utils'

function fmtInput(d: Date | string | null | undefined) {
  if (!d) return ''
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy-MM-dd') } catch { return '' }
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return ''
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy/MM/dd HH:mm') } catch { return '' }
}

// 提案求人のソート項目
const PROPOSAL_SORT_OPTIONS = [
  { value: 'proposedAt', label: '提案日' },
  { value: 'status', label: 'ステータス（選考順）' },
  { value: 'company', label: '会社名' },
  { value: 'interviewDate', label: '面接日' },
] as const
type ProposalSortKey = typeof PROPOSAL_SORT_OPTIONS[number]['value']

const toTime = (d: Date | string | null | undefined) => {
  if (!d) return null
  const t = typeof d === 'string' ? parseISO(d).getTime() : d.getTime()
  return Number.isNaN(t) ? null : t
}

const statusColor = (s: string) =>
  PROPOSAL_OFFER_STATUSES.includes(s) ? 'bg-purple-100 text-purple-700'
  : s === '承諾' ? 'bg-green-100 text-green-700'
  : ['辞退', '見送り'].includes(s) ? 'bg-gray-100 text-gray-500'
  : s === '提案' ? 'bg-blue-50 text-blue-600'
  : 'bg-amber-50 text-amber-700'

export function ProposalSection({
  customerId, ca, proposals, onUpdate,
}: {
  customerId: string
  ca: string | null
  proposals: JobProposalWithJob[]
  onUpdate: () => void
}) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [adding, setAdding] = useState(false)
  const [selectedJob, setSelectedJob] = useState('')
  const [saving, setSaving] = useState(false)
  const [showJobForm, setShowJobForm] = useState(false)
  // コピー用に選択中の提案ID（初期は全選択）
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [addingNote, setAddingNote] = useState<Record<string, boolean>>({})
  // ソート（デフォルトは提案日の新しい順＝従来の並び）
  const [sortBy, setSortBy] = useState<ProposalSortKey>('proposedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sortedProposals = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1
    const statusRank = (s: string) => {
      const i = PROPOSAL_STATUS_OPTIONS.indexOf(s)
      return i === -1 ? PROPOSAL_STATUS_OPTIONS.length : i
    }
    return [...proposals].sort((a, b) => {
      switch (sortBy) {
        case 'status':
          return (statusRank(a.status) - statusRank(b.status)) * factor
        case 'company':
          return a.job.company.localeCompare(b.job.company, 'ja') * factor
        case 'interviewDate': {
          const at = toTime(a.interviewDate)
          const bt = toTime(b.interviewDate)
          // 面接日未設定は昇順・降順どちらでも末尾に置く
          if (at === null && bt === null) return 0
          if (at === null) return 1
          if (bt === null) return -1
          return (at - bt) * factor
        }
        default: {
          const at = toTime(a.proposedAt) ?? 0
          const bt = toTime(b.proposedAt) ?? 0
          return (at - bt) * factor
        }
      }
    })
  }, [proposals, sortBy, sortDir])

  // 提案の増減時のみ全選択に初期化（ステータス変更では選択を維持）
  const proposalIds = proposals.map(p => p.id).join(',')
  const [prevIds, setPrevIds] = useState(proposalIds)
  if (proposalIds !== prevIds) {
    setPrevIds(proposalIds)
    setChecked(new Set(proposals.map(p => p.id)))
  }

  const toggleCheck = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allChecked = proposals.length > 0 && checked.size === proposals.length
  const toggleAll = () =>
    setChecked(allChecked ? new Set() : new Set(proposals.map(p => p.id)))

  // 選択した求人を「会社名／求人： URL」形式でクリップボードにコピー（表示中の並び順）
  async function copySelected() {
    const text = sortedProposals
      .filter(p => checked.has(p.id))
      .map(p => `${p.job.company}\n求人： ${p.job.sourceUrl ?? ''}`)
      .join('\n\n')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // クリップボードAPIが使えない環境向けフォールバック
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function loadJobs() {
    fetch('/api/jobs?status=募集中', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then(setJobs)
      .catch(() => {})
  }
  useEffect(() => { loadJobs() }, [])

  async function postProposal(jobId: string) {
    const res = await fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, jobId, ca, status: '提案' }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      alert(body?.error ?? '提案の作成に失敗しました')
      return false
    }
    return true
  }

  // 新規求人を登録して、その場でこの顧客への提案を作成する
  async function createJobAndPropose(job: Job) {
    await postProposal(job.id)
    loadJobs()
    onUpdate()
  }

  async function addProposal() {
    if (!selectedJob) return
    setSaving(true)
    try {
      if (!(await postProposal(selectedJob))) return
      setSelectedJob('')
      setAdding(false)
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(id: string, status: string) {
    const res = await fetch(`/api/proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { alert('ステータスの更新に失敗しました'); return }
    onUpdate()
  }

  async function changeInterviewDate(id: string, interviewDate: string) {
    const res = await fetch(`/api/proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewDate }),
    })
    if (!res.ok) { alert('面接日の更新に失敗しました'); return }
    onUpdate()
  }

  async function remove(p: JobProposalWithJob) {
    if (!confirm(`「${p.job.company} / ${p.job.title}」の提案を削除しますか？`)) return
    const res = await fetch(`/api/proposals/${p.id}`, { method: 'DELETE' })
    if (!res.ok) { alert('削除に失敗しました'); return }
    onUpdate()
  }

  // 社内メモは追記専用（編集・削除UIは設けない＝過去のメモは絶対に消えない）
  async function addNote(id: string) {
    const content = (noteDrafts[id] ?? '').trim()
    if (!content) return
    setAddingNote(prev => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/proposals/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        alert(body?.error ?? 'メモの追加に失敗しました')
        return
      }
      setNoteDrafts(prev => ({ ...prev, [id]: '' }))
      onUpdate()
    } finally {
      setAddingNote(prev => ({ ...prev, [id]: false }))
    }
  }

  // 既に提案済みの求人は候補から除外
  const proposedJobIds = new Set(proposals.map(p => p.jobId))
  const availableJobs = jobs.filter(j => !proposedJobIds.has(j.id))

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div>
          {proposals.length > 0 && (
            <button onClick={copySelected} disabled={checked.size === 0}
              className={cn(
                'flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border disabled:opacity-40',
                copied ? 'border-green-500 text-green-600 bg-green-50'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              )}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'コピーしました' : `選択をコピー（${checked.size}件）`}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowJobForm(true)}
            className="flex items-center gap-1.5 text-sm border border-[#0070D2] text-[#0070D2] px-3 py-1.5 rounded-lg hover:bg-blue-50">
            <Link2 size={15} /> 新規求人を登録して提案
          </button>
          <button onClick={() => setAdding(v => !v)}
            className="flex items-center gap-1.5 text-sm bg-[#0070D2] text-white px-3 py-1.5 rounded-lg hover:bg-[#005fb2]">
            <Plus size={15} /> 既存求人から提案
          </button>
        </div>
      </div>

      {adding && (
        <div className="border border-blue-100 bg-blue-50/50 rounded-lg p-3 flex gap-2 items-center">
          <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">求人を選択（募集中）</option>
            {availableJobs.map(j => <option key={j.id} value={j.id}>{j.company} / {j.title}</option>)}
          </select>
          <button onClick={addProposal} disabled={!selectedJob || saving}
            className="shrink-0 bg-[#0070D2] text-white px-3 py-2 rounded-lg text-sm hover:bg-[#005fb2] disabled:opacity-50">
            追加
          </button>
        </div>
      )}
      {adding && availableJobs.length === 0 && (
        <p className="text-xs text-gray-400">提案できる募集中の求人がありません。「求人」ページで登録してください。</p>
      )}

      {proposals.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">提案した求人がありません</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap px-1">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="cursor-pointer" />
              すべて選択（コピー対象）
            </label>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              並び替え
              <select value={sortBy} onChange={e => setSortBy(e.target.value as ProposalSortKey)}
                className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 cursor-pointer">
                {PROPOSAL_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="button" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                title={sortDir === 'asc' ? '昇順（クリックで降順に）' : '降順（クリックで昇順に）'}
                className="flex items-center gap-0.5 border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                {sortDir === 'asc' ? <><ArrowUp size={12} />昇順</> : <><ArrowDown size={12} />降順</>}
              </button>
            </div>
          </div>
          {sortedProposals.map(p => (
            <div key={p.id} className={cn('border rounded-lg p-3', checked.has(p.id) ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100')}>
              <div className="flex items-start gap-2">
                <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggleCheck(p.id)}
                  className="mt-1 shrink-0 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{p.job.title}</div>
                  <div className="text-xs text-gray-500">{p.job.company}</div>
                  <div className="text-xs text-gray-400 mt-1 flex gap-3 flex-wrap">
                    {p.job.salary && <span>💴 {p.job.salary}</span>}
                    {p.job.area && <span>📍 {p.job.area.split('\n')[0]}</span>}
                    {p.job.sourceUrl && (
                      <a href={p.job.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="text-blue-500 hover:underline flex items-center gap-0.5">
                        求人票 <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
                    <Calendar size={12} className="text-gray-400" />
                    面接日
                    <input type="date" value={fmtInput(p.interviewDate)}
                      onChange={e => changeInterviewDate(p.id, e.target.value)}
                      className="border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={p.status} onChange={e => changeStatus(p.id, e.target.value)}
                    className={cn('text-xs rounded-full px-2 py-1 border-0 cursor-pointer font-medium', statusColor(p.status))}>
                    {PROPOSAL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => remove(p)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="mt-2 pl-6 border-t border-gray-100 pt-2">
                <p className="text-xs text-gray-400 mb-1">社内メモ（追記のみ・削除不可）</p>
                {p.proposalNotes.length > 0 && (
                  <div className="space-y-1 mb-1.5">
                    {p.proposalNotes.map(n => (
                      <div key={n.id} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                        <p className="whitespace-pre-wrap">{n.content}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {fmtDateTime(n.createdAt)}{n.createdBy && ` / ${n.createdBy}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input value={noteDrafts[p.id] ?? ''}
                    onChange={e => setNoteDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addNote(p.id) }}
                    placeholder="メモを追加"
                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
                  <button onClick={() => addNote(p.id)} disabled={!(noteDrafts[p.id] ?? '').trim() || addingNote[p.id]}
                    className="shrink-0 text-xs px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                    追加
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showJobForm && (
        <JobFormModal
          title="新規求人を登録して提案"
          onClose={() => setShowJobForm(false)}
          onSaved={createJobAndPropose}
        />
      )}
    </div>
  )
}
