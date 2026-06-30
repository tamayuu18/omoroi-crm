'use client'

import { useState, useEffect, useCallback } from 'react'
import { Briefcase, Plus, X, Link2, Loader2, Trash2, Pencil } from 'lucide-react'
import type { Job } from '@/types'
import { JOB_STATUS_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const inp =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type FormState = {
  company: string
  title: string
  area: string
  salary: string
  employment: string
  feeRate: string
  status: string
  detail: string
  note: string
  source: string
  sourceUrl: string
}

const emptyForm: FormState = {
  company: '', title: '', area: '', salary: '', employment: '',
  feeRate: '', status: '募集中', detail: '', note: '', source: 'manual', sourceUrl: '',
}

function JobModal({ job, onClose, onSaved }: { job: Job | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(
    job
      ? {
          company: job.company, title: job.title, area: job.area ?? '', salary: job.salary ?? '',
          employment: job.employment ?? '', feeRate: job.feeRate ?? '', status: job.status,
          detail: job.detail ?? '', note: job.note ?? '', source: job.source ?? 'manual', sourceUrl: job.sourceUrl ?? '',
        }
      : emptyForm
  )
  const [url, setUrl] = useState(job?.sourceUrl ?? '')
  const [scraping, setScraping] = useState(false)
  const [scrapeMsg, setScrapeMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function handleScrape() {
    if (!url) return
    setScraping(true)
    setScrapeMsg('')
    try {
      const res = await fetch('/api/jobs/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setForm(p => ({
        ...p,
        company: d.company ?? p.company,
        title: d.title ?? p.title,
        area: d.area ?? p.area,
        salary: d.salary ?? p.salary,
        employment: d.employment ?? p.employment,
        feeRate: d.feeRate ?? p.feeRate,
        detail: d.detail ?? p.detail,
        source: d.source ?? p.source,
        sourceUrl: d.sourceUrl ?? url,
      }))
      const label = d.source === 'circus' ? 'サーカス' : d.source === 'jobins' ? 'ジョビンズ' : '対象外サイト'
      const got = d.company || d.title
      setScrapeMsg(
        got
          ? `${label}から取得しました。内容を確認・修正して保存してください。`
          : `${label}：自動取得できませんでした。手入力してください。`
      )
    } catch {
      setScrapeMsg('取得に失敗しました。手入力してください。')
    } finally {
      setScraping(false)
    }
  }

  async function handleSave() {
    if (!form.company || !form.title) {
      setScrapeMsg('企業名と職種は必須です')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        area: form.area || null, salary: form.salary || null, employment: form.employment || null,
        feeRate: form.feeRate || null, detail: form.detail || null, note: form.note || null,
        sourceUrl: form.sourceUrl || null,
      }
      const res = await fetch(job ? `/api/jobs/${job.id}` : '/api/jobs', {
        method: job ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      onSaved()
      onClose()
    } catch {
      setScrapeMsg('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold">{job ? '求人を編集' : '求人を追加'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* URL取込 */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3">
            <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1">
              <Link2 size={13} /> 求人票URLから自動取得（サーカス / ジョビンズ）
            </label>
            <div className="flex gap-2">
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className={inp} />
              <button onClick={handleScrape} disabled={scraping || !url}
                className="shrink-0 flex items-center gap-1.5 bg-[#0070D2] text-white px-3 py-2 rounded-lg text-sm hover:bg-[#005fb2] disabled:opacity-50">
                {scraping ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}取込
              </button>
            </div>
            {scrapeMsg && <p className="text-xs text-gray-600 mt-1.5">{scrapeMsg}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">企業名 *</label>
              <input value={form.company} onChange={e => set('company', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">募集状況</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
                {JOB_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">職種・ポジション *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">勤務地</label>
              <input value={form.area} onChange={e => set('area', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">想定年収</label>
              <input value={form.salary} onChange={e => set('salary', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">雇用形態</label>
              <input value={form.employment} onChange={e => set('employment', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">手数料率</label>
              <input value={form.feeRate} onChange={e => set('feeRate', e.target.value)} placeholder="例: 35%" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">求人詳細・条件</label>
            <textarea value={form.detail} onChange={e => set('detail', e.target.value)} rows={6}
              className={inp + ' resize-y'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} className={inp + ' resize-y'} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">キャンセル</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#0070D2] text-white rounded-lg hover:bg-[#005fb2] disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

      {showModal && <JobModal job={modalJob} onClose={() => setShowModal(false)} onSaved={fetchJobs} />}
    </div>
  )
}
