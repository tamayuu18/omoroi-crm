import { parse } from 'node-html-parser'

// 求人票URLから抽出した下書き（Jobフォームへ流し込む）
export type JobDraft = {
  company?: string
  title?: string
  area?: string
  salary?: string
  employment?: string
  feeRate?: string
  detail?: string
  source: 'circus' | 'jobins' | 'manual'
  sourceUrl: string
  // 自動取得の診断情報（UIで失敗理由を表示するため）
  _debug?: { fetched: boolean; status?: number; length?: number; extracted: boolean; error?: string }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export function detectSource(url: string): JobDraft['source'] {
  try {
    const host = new URL(url).hostname
    if (host.includes('circus-job.com')) return 'circus'
    if (host.includes('jobins.jp')) return 'jobins'
  } catch {
    /* 不正URL */
  }
  return 'manual'
}

async function fetchHtml(url: string): Promise<{ html: string; status: number }> {
  const origin = (() => { try { return new URL(url).origin } catch { return undefined } })()
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en;q=0.9',
      ...(origin ? { Referer: origin } : {}),
    },
    redirect: 'follow',
  })
  const html = await res.text()
  return { html, status: res.status }
}

// ===== サーカス（Next.js __NEXT_DATA__ のJSONを解析）=====
type MasterNode = { id: number; name: string; items?: MasterNode[] }

function flattenMaster(node: { items?: MasterNode[] } | undefined): Map<number, string> {
  const map = new Map<number, string>()
  const walk = (items?: MasterNode[]) => {
    for (const it of items ?? []) {
      if (typeof it.id === 'number' && typeof it.name === 'string') map.set(it.id, it.name)
      if (it.items) walk(it.items)
    }
  }
  walk(node?.items)
  return map
}

function scrapeCircus(html: string, url: string): JobDraft {
  const draft: JobDraft = { source: 'circus', sourceUrl: url }
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return draft
  let data: any
  try {
    data = JSON.parse(m[1])
  } catch {
    return draft
  }
  const pageProps = data?.props?.pageProps
  const job = pageProps?.publicJob?.job
  const master = pageProps?.initialState?.master
  if (!job) return draft

  draft.company = job.company?.name ?? undefined
  draft.title = job.name ?? undefined

  // 想定年収
  const sal = job.expectedAnnualSalary
  if (sal && (sal.min || sal.max)) draft.salary = `${sal.min ?? ''}万円〜${sal.max ?? ''}万円`

  // 雇用形態（IDをmasterでラベル化）
  const empMap = flattenMaster(master?.employmentTypes)
  if (Array.isArray(job.employmentTypes)) {
    const labels = job.employmentTypes.map((id: number) => empMap.get(id)).filter(Boolean)
    if (labels.length) draft.employment = labels.join('・')
  }

  // 勤務地（都道府県IDをmasterでラベル化＋詳細）
  const prefMap = flattenMaster(master?.prefectures)
  const prefs = (job.addresses ?? [])
    .map((a: any) => prefMap.get(a.prefecture))
    .filter(Boolean)
  const areaParts = [prefs.join('・'), job.addressDetail].filter(Boolean)
  if (areaParts.length) draft.area = areaParts.join('\n')

  // 詳細（仕事内容・必須要件・内定可能性が高い人など）
  const detailParts = [
    job.jobDescriptions && `【仕事内容】\n${job.jobDescriptions}`,
    job.minimumQualification && `【応募必須要件】\n${job.minimumQualification}`,
    job.idealCandidate && `【内定の可能性が高い人】\n${job.idealCandidate}`,
    job.annualSalaryExample && `【給与・年収例】\n${job.annualSalaryExample}`,
  ].filter(Boolean)
  if (detailParts.length) draft.detail = detailParts.join('\n\n')

  // 手数料率（法令表記テキストから「○○％」を抽出）
  const feeText: string = job.jobPostOwnerCompany?.employmentLaw?.commissionFee ?? ''
  const fee = feeText.match(/(\d+(?:\.\d+)?)\s*[%％]/)
  if (fee) draft.feeRate = `${fee[1]}%`

  return draft
}

// ===== ジョビンズ（SSRされたHTMLをラベル走査で解析）=====
function scrapeJobins(html: string, url: string): JobDraft {
  const draft: JobDraft = { source: 'jobins', sourceUrl: url }
  const root = parse(html)

  // 企業名：ヘッダーのナビ内テキスト
  const navText = root.querySelector('nav span')?.text?.trim()
  if (navText) draft.company = navText

  // 求人名：太字の見出しテキスト
  const titleEl = root.querySelectorAll('p').find(p => p.classNames.includes('jb-font-medium'))
  if (titleEl) draft.title = titleEl.text.trim()

  // ラベル(h2/h3)→値 を収集（値は親要素テキストからラベルを除いたもの）
  const pairs: { label: string; value: string }[] = []
  for (const el of root.querySelectorAll('h2, h3')) {
    const label = el.text.trim()
    if (!label) continue
    const parent = el.parentNode
    if (!parent) continue
    const span = parent.querySelector('span')
    let value = span ? span.text.trim() : parent.text.replace(label, '').trim()
    value = value.replace(/\s+\n/g, '\n').trim()
    if (value && value !== label) pairs.push({ label, value })
  }

  // 同一ラベルから最短値（単一項目向け）/最長値（本文向け）を取得
  const shortest = (label: string) => {
    const vs = pairs.filter(p => p.label === label).map(p => p.value)
    return vs.length ? vs.reduce((a, b) => (a.length <= b.length ? a : b)) : undefined
  }
  const longest = (label: string) => {
    const vs = pairs.filter(p => p.label === label).map(p => p.value)
    return vs.length ? vs.reduce((a, b) => (a.length >= b.length ? a : b)) : undefined
  }

  draft.salary = shortest('年収')
  draft.area = shortest('勤務地')
  draft.employment = shortest('雇用形態')

  const detailParts = [
    longest('仕事内容') && `【仕事内容】\n${longest('仕事内容')}`,
    longest('応募条件') && `【応募条件】\n${longest('応募条件')}`,
    longest('歓迎条件') && `【歓迎条件】\n${longest('歓迎条件')}`,
    longest('選考フロー') && `【選考フロー】\n${longest('選考フロー')}`,
    longest('給与詳細') && `【給与詳細】\n${longest('給与詳細')}`,
  ].filter(Boolean)
  if (detailParts.length) draft.detail = detailParts.join('\n\n')

  // ジョビンズの公開ページに手数料率は出ないため feeRate は未設定（手入力）

  return draft
}

// 与えられたHTMLから下書きを抽出する（サーバー取得できない場合に、ブラウザのHTMLを貼り付けて使う）。
export function scrapeFromHtml(source: JobDraft['source'], html: string, url: string): JobDraft {
  const draft = source === 'circus' ? scrapeCircus(html, url)
    : source === 'jobins' ? scrapeJobins(html, url)
    : { source, sourceUrl: url }
  const extracted = !!(draft.company || draft.title)
  draft._debug = { ...(draft._debug ?? { fetched: true, extracted }), fetched: true, extracted, length: html.length }
  return draft
}

// URLから求人票を取得して下書きを返す。失敗時は source を保持した空の下書き＋診断情報を返す。
export async function scrapeJob(url: string): Promise<JobDraft> {
  const source = detectSource(url)
  if (source === 'manual') {
    return { source: 'manual', sourceUrl: url, _debug: { fetched: false, extracted: false, error: '対象外サイト' } }
  }
  try {
    const { html, status } = await fetchHtml(url)
    if (status >= 400) {
      return { source, sourceUrl: url, _debug: { fetched: true, status, length: html.length, extracted: false, error: `HTTP ${status}` } }
    }
    const draft = scrapeFromHtml(source, html, url)
    if (draft._debug) draft._debug.status = status
    return draft
  } catch (e) {
    console.error('scrapeJob failed', e)
    return { source, sourceUrl: url, _debug: { fetched: false, extracted: false, error: e instanceof Error ? e.message : 'fetch error' } }
  }
}
