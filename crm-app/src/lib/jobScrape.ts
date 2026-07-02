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
  // snippet: サーバーが実際に受け取ったHTMLの先頭抜粋（bot対策の遮断ページか本物かの判別用）
  _debug?: { fetched: boolean; status?: number; length?: number; extracted: boolean; error?: string; snippet?: string }
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
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
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
      signal: ctrl.signal,
    })
    const html = await res.text()
    return { html, status: res.status }
  } finally {
    clearTimeout(timer)
  }
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

// ===== ジョビンズ =====
// ジョビンズは Laravel + Vue(Inertia.js) 構成。求人データはDOMではなく、
// HTML内の <div id="app" data-page="{...JSON...}"> に埋め込まれている。
// このJSONはサーバー取得の生HTML（JS未描画）にも含まれるため、まずこれを読む。
// 取れない場合のみ、描画済みDOM（貼り付けHTML等）向けのラベル走査にフォールバックする。

// HTML属性内のエンティティを復元（Inertiaは htmlspecialchars(ENT_QUOTES) 相当でエンコード）
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#0?38;/g, '&')
    .replace(/&amp;/g, '&')
}

// HTML片からタグを除いてテキスト化（求人詳細のdescription整形用）
function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '・')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

// data-page 属性のJSONを取り出してパースする
function extractInertiaPage(html: string): unknown | undefined {
  const m = html.match(/data-page="([^"]*)"/)
  if (!m) return undefined
  try {
    return JSON.parse(decodeHtmlEntities(m[1]))
  } catch {
    return undefined
  }
}

// JSONを再帰走査し、候補キー（大小無視）に一致する最初の非空文字列/数値を返す
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

const f = (v: string | undefined, label: string) => (v ? `【${label}】\n${v}` : undefined)

// Inertiaの data-page JSON から求人下書きを組み立てる
function scrapeJobinsJson(page: unknown, url: string): JobDraft {
  const draft: JobDraft = { source: 'jobins', sourceUrl: url }
  // props配下に求人データがある想定。無ければpage全体を対象にする
  const props = (page && typeof page === 'object' && 'props' in page)
    ? (page as { props: unknown }).props : page

  draft.company = deepFindString(props, ['company_name', 'companyName', 'corporation_name', 'client_name', 'company', 'employer_name'])
  draft.title = deepFindString(props, ['job_title', 'jobTitle', 'position_name', 'position', 'occupation_name', 'title', 'job_name', 'name'])
  draft.salary = deepFindString(props, ['annual_income', 'annualIncome', 'expected_salary', 'salary_range', 'income_range', 'salary', 'income', 'annual_salary'])
  draft.area = deepFindString(props, ['work_location', 'workplace', 'work_place', 'location', 'prefecture_name', 'prefecture', 'area', 'work_address', 'address'])
  draft.employment = deepFindString(props, ['employment_type', 'employmentType', 'contract_type', 'employment', 'employment_status', 'work_style'])

  const detailParts = [
    f(deepFindString(props, ['job_description', 'jobDescription', 'business_content', 'job_content', 'work_content', 'description', 'detail']), '仕事内容'),
    f(deepFindString(props, ['application_requirement', 'requirement', 'required_condition', 'qualification', 'must_condition', 'required_skill']), '応募条件'),
    f(deepFindString(props, ['welcome_condition', 'preferred_condition', 'welcome_requirement', 'want_condition', 'welcome_skill']), '歓迎条件'),
    f(deepFindString(props, ['selection_flow', 'selection_process', 'interview_flow', 'process', 'flow']), '選考フロー'),
    f(deepFindString(props, ['salary_detail', 'salaryDetail', 'income_detail', 'treatment', 'benefit']), '給与・待遇'),
  ].filter(Boolean)
  if (detailParts.length) draft.detail = detailParts.join('\n\n')

  return draft
}

// 描画済みDOM向け：ラベル(h2/h3)走査で解析（貼り付けHTML等のフォールバック）
function scrapeJobinsDom(html: string, url: string): JobDraft {
  const draft: JobDraft = { source: 'jobins', sourceUrl: url }
  const root = parse(html)

  const navText = root.querySelector('nav span')?.text?.trim()
  if (navText) draft.company = navText

  const titleEl = root.querySelectorAll('p').find(p => p.classNames.includes('jb-font-medium'))
  if (titleEl) draft.title = titleEl.text.trim()

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
    f(longest('仕事内容'), '仕事内容'),
    f(longest('応募条件'), '応募条件'),
    f(longest('歓迎条件'), '歓迎条件'),
    f(longest('選考フロー'), '選考フロー'),
    f(longest('給与詳細'), '給与詳細'),
  ].filter(Boolean)
  if (detailParts.length) draft.detail = detailParts.join('\n\n')

  return draft
}

// ===== JSON-LD(schema.org JobPosting) 解析 =====
// 求人ページはSEO用に <script type="application/ld+json"> の JobPosting を持つことが多い。
// これは生HTMLに含まれるため、サーバー取得でも読める。
function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try { blocks.push(JSON.parse(m[1].trim())) } catch { /* 壊れたJSONは無視 */ }
  }
  return blocks
}

function findJobPosting(blocks: unknown[]): Record<string, unknown> | undefined {
  const isJP = (o: unknown): o is Record<string, unknown> => {
    if (!o || typeof o !== 'object') return false
    const t = (o as Record<string, unknown>)['@type']
    return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))
  }
  for (const b of blocks) {
    if (isJP(b)) return b
    if (b && typeof b === 'object') {
      const graph = (b as Record<string, unknown>)['@graph']
      if (Array.isArray(graph)) {
        const jp = graph.find(isJP)
        if (jp) return jp as Record<string, unknown>
      }
    }
  }
  return undefined
}

function scrapeJobinsJsonLd(jp: Record<string, unknown>, url: string): JobDraft {
  const draft: JobDraft = { source: 'jobins', sourceUrl: url }
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

  draft.title = s(jp.title) ?? deepFindString(jp, ['title', 'name'])
  draft.company = deepFindString(jp.hiringOrganization, ['name', 'legalName'])
  draft.area = deepFindString(jp.jobLocation, ['addressRegion', 'addressLocality', 'streetAddress'])

  const emp = jp.employmentType
  draft.employment = typeof emp === 'string' ? emp
    : Array.isArray(emp) ? emp.filter(x => typeof x === 'string').join('・') || undefined
    : undefined

  const min = deepFindString(jp.baseSalary, ['minValue'])
  const max = deepFindString(jp.baseSalary, ['maxValue'])
  const val = deepFindString(jp.baseSalary, ['value'])
  draft.salary = (min || max) ? `${min ?? ''}〜${max ?? ''}` : val

  const desc = s(jp.description)
  if (desc) draft.detail = stripTags(desc)

  return draft
}

// 診断用：HTML内にどのデータ形式が含まれるかを一覧化（原因特定を1往復で行うため）
function jobinsDiagnostic(html: string): string {
  const has = (re: RegExp) => (re.test(html) ? 'Y' : 'N')
  const count = (re: RegExp) => (html.match(re) || []).length
  return [
    `len=${html.length}`,
    `ld+json=${count(/application\/ld\+json/gi)}`,
    `JobPosting=${has(/JobPosting/)}`,
    `data-page=${has(/data-page=/)}`,
    `__NUXT__=${has(/__NUXT__/)}`,
    `__NEXT_DATA__=${has(/__NEXT_DATA__/)}`,
    `window.__=${has(/window\.__[A-Za-z]/)}`,
    `nav=${has(/<nav/i)}`,
    `h2=${count(/<h2/gi)}`,
    `jb-font-medium=${has(/jb-font-medium/)}`,
  ].join(' ')
}

function scrapeJobins(html: string, url: string): JobDraft {
  // 1) JSON-LD(JobPosting) 構造化データ
  const jp = findJobPosting(extractJsonLd(html))
  if (jp) {
    const draft = scrapeJobinsJsonLd(jp, url)
    if (draft.company || draft.title) return draft
  }
  // 2) 埋め込みJSON（Inertia data-page）
  const page = extractInertiaPage(html)
  if (page) {
    const draft = scrapeJobinsJson(page, url)
    if (draft.company || draft.title) return draft
  }
  // 3) DOM走査（描画済みHTML向け）
  const domDraft = scrapeJobinsDom(html, url)
  if (domDraft.company || domDraft.title) return domDraft

  // すべて失敗 → HTMLの構造診断を残す（次の手がかり）
  domDraft._debug = { fetched: true, extracted: false, snippet: `診断 ${jobinsDiagnostic(html)}` }
  return domDraft
}

// 与えられたHTMLから下書きを抽出する（サーバー取得できない場合に、ブラウザのHTMLを貼り付けて使う）。
export function scrapeFromHtml(source: JobDraft['source'], html: string, url: string): JobDraft {
  const draft = source === 'circus' ? scrapeCircus(html, url)
    : source === 'jobins' ? scrapeJobins(html, url)
    : { source, sourceUrl: url }
  const extracted = !!(draft.company || draft.title)
  // 抽出できなかった場合は、スクレイパが残した診断（無ければHTML先頭抜粋）を添える
  // （bot対策の遮断ページ／ログイン画面なのか、本物のページなのかを判別するため）
  const snippet = extracted ? undefined : (draft._debug?.snippet ?? plainSnippet(html))
  draft._debug = { ...(draft._debug ?? { fetched: true, extracted }), fetched: true, extracted, length: html.length, snippet }
  return draft
}

// HTMLからタグを大まかに除いた先頭テキスト抜粋（診断表示用）
function plainSnippet(html: string, max = 220): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, max)
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
      return { source, sourceUrl: url, _debug: { fetched: true, status, length: html.length, extracted: false, error: `HTTP ${status}`, snippet: plainSnippet(html) } }
    }
    const draft = scrapeFromHtml(source, html, url)
    if (draft._debug) draft._debug.status = status
    return draft
  } catch (e) {
    console.error('scrapeJob failed', e)
    const msg = e instanceof Error ? (e.name === 'AbortError' ? 'タイムアウト（12秒）' : e.message) : 'fetch error'
    return { source, sourceUrl: url, _debug: { fetched: false, extracted: false, error: msg } }
  }
}
