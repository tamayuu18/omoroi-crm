'use client'

import { useState, useEffect, useCallback } from 'react'
import { Briefcase, Plus, Trash2, Pencil } from 'lucide-react'
import type { Job } from '@/types'
import { JOB_STATUS_OPTIONS } from '@/lib/constants'
import { JobFormModal } from '@/components/JobFormModal'
import { cn } from '@/lib/utils'

const inp =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const statusColor: Record<string, string> = {
  募集中: 'bg-green-100 text-green-700',
  停止: 'bg-yellow-100 text-yellow-700',
  クローズ: 'bg-gray-100 text-gray-500',
}


export function JobsClient() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalJob, setModalJob] = useState<Job | null>(null)
  const [showModal, setShowModal] = useState(false)

  const fetchJobs = useCallback(async () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    const res = await fetch(`/api/jobs?${params}`, { cache: 'no-store' })
    if (res.ok) setJobs(await res.json())
    setLoading(false)
  }, [search, statusFilter])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  async function handleDelete(job: Job) {
    if (!confirm(`「${job.company} / ${job.title}」を削除しますか？`)) return
    await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
    fetchJobs()
  }

  function openNew() { setModalJob(null); setShowModal(true) }
  function openEdit(j: Job) { setModalJob(j); setShowModal(true) }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Briefcase size={20} className="text-[#0070D2]" /> 求人マスタ
        </h1>
        <button onClick={openNew}
          className="flex items-center gap-1.5 bg-[#0070D2] text-white px-3 py-2 rounded-lg text-sm hover:bg-[#005fb2]">
          <Plus size={16} /> 求人を追加
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="企業名・職種・勤務地で検索"
          className={inp + ' max-w-xs'} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <option value="">全状況</option>
          {JOB_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white rounded-xl" />)}</div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400 text-sm">求人がありません。「求人を追加」から登録してください。</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-50">
          {jobs.map(j => (
            <div key={j.id} className="p-4 flex items-start gap-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">{j.title}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', statusColor[j.status] ?? 'bg-gray-100 text-gray-500')}>{j.status}</span>
                  {j.source && j.source !== 'manual' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      {j.source === 'circus' ? 'サーカス' : 'ジョビンズ'}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 mt-0.5">{j.company}</div>
                <div className="text-xs text-gray-400 mt-1 flex gap-3 flex-wrap">
                  {j.area && <span>📍 {j.area.split('\n')[0]}</span>}
                  {j.salary && <span>💴 {j.salary}</span>}
                  {j.feeRate && <span>手数料 {j.feeRate}</span>}
                  {j.sourceUrl && <a href={j.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">求人票</a>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(j)} className="p-2 text-gray-400 hover:text-blue-600"><Pencil size={15} /></button>
                <button onClick={() => handleDelete(j)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <JobFormModal job={modalJob} onClose={() => setShowModal(false)} onSaved={() => fetchJobs()} />}
    </div>
  )
}
