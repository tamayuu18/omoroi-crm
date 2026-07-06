'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ExternalLink, Link2, Copy, Check, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Job, JobProposalWithJob } from '@/types'
import { PROPOSAL_STATUS_OPTIONS, PROPOSAL_OFFER_STATUSES } from '@/lib/constants'
import { JobFormModal } from '@/components/JobFormModal'
import { cn } from '@/lib/utils'

function fmtInput(d: Date | string | null | undefined) {
  if (!d) return ''
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy-MM-dd') } catch { return '' }
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

  // 選択した求人を「会社名／求人： URL」形式でクリップボードにコピー
  async function copySelected() {
    const text = proposals
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

  // 新規求人を登録して、その場でこの顧客への提案を作成する
  async function createJobAndPropose(job: Job) {
    await fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, jobId: job.id, ca, status: '提案' }),
    })
    loadJobs()
    onUpdate()
  }

  async function addProposal() {
    if (!selectedJob) return
    setSaving(true)
    try {
      await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, jobId: selectedJob, ca, status: '提案' }),
      })
      setSelectedJob('')
      setAdding(false)
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(id: string, status: string) {
    await fetch(`/api/proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onUpdate()
  }

  async function changeInterviewDate(id: string, interviewDate: string) {
    await fetch(`/api/proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewDate }),
    })
    onUpdate()
  }

  async function remove(p: JobProposalWithJob) {
    if (!confirm(`「${p.job.company} / ${p.job.title}」の提案を削除しますか？`)) return
    await fetch(`/api/proposals/${p.id}`, { method: 'DELETE' })
    onUpdate()
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
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none px-1">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="cursor-pointer" />
            すべて選択（コピー対象）
          </label>
          {proposals.map(p => (
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
