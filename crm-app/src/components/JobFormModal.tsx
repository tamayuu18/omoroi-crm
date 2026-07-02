'use client'

import { useState } from 'react'
import { X, Link2, Loader2 } from 'lucide-react'
import type { Job } from '@/types'
import { JOB_STATUS_OPTIONS } from '@/lib/constants'

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

// 求人の新規登録・編集フォーム（求人マスタ／顧客の提案タブで共用）。
// 保存に成功すると onSaved(job) に作成/更新後の求人を渡す。
export function JobFormModal({
  job, title, onClose, onSaved,
}: {
  job?: Job | null
  title?: string
  onClose: () => void
  onSaved: (job: Job) => void
}) {
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
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [htmlPaste, setHtmlPaste] = useState('')

  const set = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }))

  // URL取得（html未指定）またはHTML貼り付け（html指定）で下書きを取得する
  async function runScrape(html?: string) {
    if (!url) { setMsg('先に求人票URLを入力してください'); return }
    setScraping(true)
    setMsg('')
    try {
      const res = await fetch('/api/jobs/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(html ? { url, html } : { url }),
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
      if (d.company || d.title) {
        setMsg(`${label}から取得しました。内容を確認・修正して保存してください。`)
        setShowPaste(false)
      } else {
        // 失敗理由を診断情報から表示し、HTML貼り付けを促す
        const dbg = d._debug ?? {}
        const parts = [
          dbg.error ? `理由: ${dbg.error}` : dbg.status ? `HTTP ${dbg.status}` : null,
          typeof dbg.length === 'number' ? `取得サイズ: ${dbg.length}文字` : null,
          dbg.snippet ? `受信内容: ${dbg.snippet}` : null,
        ].filter(Boolean)
        const reason = parts.length ? `（${parts.join(' / ')}）` : ''
        setMsg(`${label}：サーバーからの自動取得ができませんでした${reason}。下の「ページのHTMLを貼り付けて取込」をお試しください。`)
        setShowPaste(true)
      }
    } catch {
      setMsg('取得に失敗しました。ページのHTMLを貼り付けて取込するか、手入力してください。')
      setShowPaste(true)
    } finally {
      setScraping(false)
    }
  }

  async function handleSave() {
    if (!form.company || !form.title) {
      setMsg('企業名と職種は必須です')
      return
    }
    setSaving(true)
    setMsg('')
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `保存に失敗しました (${res.status})`)
      }
      const saved: Job = await res.json()
      onSaved(saved)
      onClose()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold">{title ?? (job ? '求人を編集' : '求人を追加')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* URL取込 */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3 space-y-2">
            <label className="block text-xs font-medium text-gray-600 flex items-center gap-1">
              <Link2 size={13} /> 求人票URLから自動取得（サーカス / ジョビンズ）
            </label>
            <div className="flex gap-2">
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className={inp} />
              <button onClick={() => runScrape()} disabled={scraping || !url}
                className="shrink-0 flex items-center gap-1.5 bg-[#0070D2] text-white px-3 py-2 rounded-lg text-sm hover:bg-[#005fb2] disabled:opacity-50">
                {scraping ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}取込
              </button>
            </div>

            {/* HTML貼り付けフォールバック（サーバー取得できない媒体向け） */}
            <button type="button" onClick={() => setShowPaste(v => !v)}
              className="text-xs text-blue-600 hover:underline">
              {showPaste ? '▼' : '▶'} 取り込めない場合：ページのHTMLを貼り付けて取込
            </button>
            {showPaste && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  求人ページをブラウザで開き、右クリック→「ページのソースを表示」→全選択(⌘A)→コピー(⌘C) して、下に貼り付けてください。
                </p>
                <textarea value={htmlPaste} onChange={e => setHtmlPaste(e.target.value)} rows={4}
                  placeholder="<html> ... </html>" className={inp + ' font-mono text-[11px] resize-y'} />
                <button onClick={() => runScrape(htmlPaste)} disabled={scraping || !url || !htmlPaste}
                  className="flex items-center gap-1.5 bg-[#0070D2] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-[#005fb2] disabled:opacity-50">
                  {scraping ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}貼り付けたHTMLから取込
                </button>
              </div>
            )}
          </div>

          {msg && <p className="text-xs text-red-600">{msg}</p>}

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
            <textarea value={form.detail} onChange={e => set('detail', e.target.value)} rows={6} className={inp + ' resize-y'} />
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
