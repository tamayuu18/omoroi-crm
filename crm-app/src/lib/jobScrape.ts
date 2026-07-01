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
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua': '"Chromium";v="120", "Not A(Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
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

// ===== ジョビンズ（公開APIのJSONを優先。/public/job-detail/<uuid> のUUIDでAPIを叩く）=====
// ジョビンズは Vue の SPA で、画面の中身は api.jobins.jp から取得している。
// 求人ページのHTMLを直接サーバー取得すると bot 対策で中身が返らないことがあるため、
// フロントと同じ公開APIを叩いて JSON から下書きを作る。
function extractJobinsId(url: string): string | undefined {
  // 例: https://jobins.jp/public/job-detail/111cdde0-1615-11f1-9024-068c8962773d
  const m = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return m ? m[1] : undefined
}

// JSON を再帰的に走査し、候補キーに一致する最初の非空文字列を返す
function deepFindString(obj: unknown, keys: string[], seen = new Set<object>()): string | undefined {
  if (obj == null || typeof obj !== 'object' || seen.has(obj)) return undefined
  seen.add(obj)
  const lowered = keys.map(k => k.toLowerCase())
  for (const [k, v] of Object.entries(obj)) {
    if (lowered.includes(k.toLowerCase())) {
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number') return String(v)
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = deepFindString(v, keys, seen)
      if (found) return found
    }
  }
  return undefined
}

// APIレスポンスの job オブジェクトを探す（{data:{...}} / {job:{...}} / 直下 いずれにも対応）
function pickJobObject(json: unknown): unknown {
  if (!json || typeof json !== 'object') return json
  const rec = json as Record<string, unknown>
  for (const key of ['data', 'job', 'result', 'jobDetail', 'job_detail']) {
    if (rec[key] && typeof rec[key] === 'object') return rec[key]
  }
  return json
}

function scrapeJobinsJson(json: unknown, url: string): JobDraft {
  const draft: JobDraft = { source: 'jobins', sourceUrl: url }
  const job = pickJobObject(json)

  draft.company =
    deepFindString(job, ['company_name', 'companyName', 'corporation_name', 'client_name', 'company', 'employer_name'])
  draft.title =
    deepFindString(job, ['job_title', 'jobTitle', 'position_name', 'position', 'occupation_name', 'title', 'name'])
  draft.salary =
    deepFindString(job, ['annual_income', 'annualIncome', 'expected_salary', 'salary_range', 'salary', 'income', 'annual_salary'])
  draft.area =
    deepFindString(job, ['work_location', 'workplace', 'work_place', 'location', 'prefecture_name', 'prefecture', 'area', 'address'])
  draft.employment =
    deepFindString(job, ['employment_type', 'employmentType', 'contract_type', 'employment', 'employment_status'])

  const detailParts = [
    deepFindString(job, ['job_description', 'jobDescription', 'business_content', 'job_content', 'description', 'detail']) && `【仕事内容】\n${deepFindString(job, ['job_description', 'jobDescription', 'business_content', 'job_content', 'description', 'detail'])}`,
    deepFindString(job, ['application_requirement', 'requirement', 'required_condition', 'qualification', 'must_condition']) && `【応募条件】\n${deepFindString(job, ['application_requirement', 'requirement', 'required_condition', 'qualification', 'must_condition'])}`,
    deepFindString(job, ['welcome_condition', 'preferred_condition', 'welcome_requirement', 'want_condition']) && `【歓迎条件】\n${deepFindString(job, ['welcome_condition', 'preferred_condition', 'welcome_requirement', 'want_condition'])}`,
    deepFindString(job, ['selection_flow', 'selection_process', 'interview_flow', 'process']) && `【選考フロー】\n${deepFindString(job, ['selection_flow', 'selection_process', 'interview_flow', 'process'])}`,
    deepFindString(job, ['salary_detail', 'salaryDetail', 'income_detail', 'treatment']) && `【給与・待遇】\n${deepFindString(job, ['salary_detail', 'salaryDetail', 'income_detail', 'treatment'])}`,
  ].filter(Boolean)
  if (detailParts.length) draft.detail = detailParts.join('\n\n')

  return draft
}

// ジョビンズの公開APIから求人JSONを取得（複数の想定エンドポイントを順に試す）
async function fetchJobinsApi(uuid: string, url: string): Promise<JobDraft | undefined> {
  const candidates = [
    `https://api.jobins.jp/public/job-detail/${uuid}`,
    `https://api.jobins.jp/api/public/job-detail/${uuid}`,
    `https://api.jobins.jp/public/job/${uuid}`,
    `https://api.jobins.jp/v1/public/job-detail/${uuid}`,
  ]
  for (const api of candidates) {
    try {
      const res = await fetch(api, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          Origin: 'https://jobins.jp',
          Referer: 'https://jobins.jp/',
        },
        redirect: 'follow',
      })
      if (!res.ok) continue
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('json')) continue
      const json = await res.json().catch(() => undefined)
      if (!json) continue
      const draft = scrapeJobinsJson(json, url)
      if (draft.company || draft.title) {
        draft._debug = { fetched: true, status: res.status, extracted: true }
        return draft
      }
    } catch {
      /* 次の候補へ */
    }
  }
  return undefined
}

// ===== ジョビンズ（SSRされたHTMLをラベル走査で解析。API取得できない場合のフォールバック）=====
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

  // ジョビンズはHTML直取得がbot対策で失敗しやすいため、まず公開APIをUUIDで試す
  if (source === 'jobins') {
    const uuid = extractJobinsId(url)
    if (uuid) {
      const apiDraft = await fetchJobinsApi(uuid, url).catch(() => undefined)
      if (apiDraft) return apiDraft
    }
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
