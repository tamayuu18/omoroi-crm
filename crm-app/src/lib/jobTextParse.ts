// 求人票ページを丸ごとコピーした「ベタ打ちテキスト」から求人の下書きを組み立てる。
// 主にジョバディ（求人詳細画面を全選択→コピーしたもの）を想定しつつ、
// 「ラベル行 → 値の行」が並ぶ形式なら他媒体でもそれなりに拾えるようにしている。
// ブラウザ側（フォーム）で直接使えるよう、外部依存なしの純粋関数のみ。

export type ParsedJobText = {
  company?: string
  title?: string
  area?: string
  salary?: string
  employment?: string
  feeRate?: string
  detail?: string
  note?: string
  source: 'jobady' | 'manual'
  // 認識したラベル数（UIで「何も拾えなかった」を判定するため）
  matched: number
}

type Entry = { label: string; value: string }

// ===== ラベル定義 =====
// 値が複数行になりうる項目（改行を保持する）。それ以外は1行に圧縮する。
const MULTILINE = new Set([
  '業務内容（概要）', '業務内容（詳細）', '1日の流れ', '職場の雰囲気について', 'PRポイント',
  '年収備考', '給与備考', 'その他福利厚生', '就業時間・休日備考', '求職者への伝達事項',
  '求人条件特記事項', '事業内容', '企業理念orビジョンの説明', '早期退職規定', 'その他条件',
  '選考フロー', '必要な経験・スキル', 'あれば尚可な経験・資格等', 'NG条件', '必要な免許・資格',
  '仕事内容', '応募条件', '歓迎条件', '給与詳細', '福利厚生', '休日・休暇', '勤務時間', '募集背景',
])

// 画面の見出し・タブなど、値を持たない区切り行
const SECTION_HEADERS = [
  '基本情報', '業務内容', '給与', '時間・休日', '応募条件', 'ペルソナ', '勤務地', '選考フロー',
  '面接情報', '部署情報', '企業情報', '寮・社宅', '画像', '求人詳細',
]

// ジョバディの入力項目ラベル（行全体がこれに一致したら新しい項目の開始とみなす）
const FIELD_LABELS = [
  '掲載サイト', '求人状態', '募集背景', '業界', '職種', '商材・サービス', '雇用形態・期間', '期間', '試用期間',
  '条件変更内容', '業務内容（概要）', '業務内容（詳細）', '1日の流れ', '職場の雰囲気について', 'PRポイント',
  '求人の特徴', '営業の場合　営業先', '営業の場合 営業先',
  '年収', '初年度想定年収', '賞与・昇給', '年収備考', 'メイン給与区分', 'サブ給与区分', '給与備考',
  '交通費', '福利厚生(手当)', '福利厚生（手当）', '福利厚生(休暇)', '福利厚生（休暇）', 'その他福利厚生', '加入保険', '給与支払い日',
  '就業時間', '休日', '休憩時間', '時間外勤務', '就業時間・休日備考',
  '入社日', '勤務時間', '必要な免許・資格', '必要な経験・スキル', 'NG条件', 'あれば尚可な経験・資格等',
  '年齢', '性別', '外国籍', '在留資格', '日本語能力試験レベル＋日本語レベル', 'その他条件',
  '就業先企業名', '就業先部署名', '就業先住所', '都道府県', '市区町村', '番地以下', '勤務スタイル', '転勤',
  '自動車通勤', '自転車通勤', '公共交通機関①', '公共交通機関②', '公共交通機関③',
  '面接回数', '一次面接', '二次面接', '三次面接', '四次面接', '五次面接', '最終面接', '面接場所', '求職者への伝達事項',
  '部署人数', '年齢層', '男女比', '勤務時の服装', '採用予定人数', '受動喫煙対策', '就業場所', '就業範囲', '求人条件特記事項',
  '業界（大分類）', '業界（中分類）', '事業内容', '創業', '資本金', '従業員規模', '上場区分',
  '企業理念orビジョン', '企業理念orビジョンの説明',
  '部屋タイプ', '家具・備品', '家賃', 'その他',
  '協力会社報酬予定金額', '早期退職規定',
  // 他媒体向けの汎用ラベル
  '企業名', '会社名', '職種名', '仕事内容', '歓迎条件', '給与詳細', '福利厚生', '休日・休暇', '雇用形態', '手数料', '紹介手数料',
]

// 複数選択項目は選択肢ラベルが区切り無しで連結されるため、既知の選択肢で分割して読みやすくする
const OPTION_LISTS: Record<string, string[]> = {
  '掲載サイト': ['ジョバディ工場', 'ジョバディ新卒', 'ジョバディ本体'],
  '募集背景': [
    '既存業務拡大に伴う増員募集', '既存ポジションではない新たな役割発生に伴う増員募集',
    '新規事業・プロジェクト立ち上げに伴う募集', '組織改編や組織活性化目的のための募集', '既存社員の後任募集',
  ],
  '福利厚生(手当)': ['固定残業代', '残業手当', '通勤手当', '家族手当', '住宅手当', '夜間手当', '社宅・社員寮', '退職金制度'],
  '福利厚生(休暇)': ['夏季休暇', '年末年始休暇', '特別休暇（冠婚葬祭）', '出産・育児休業'],
  '加入保険': ['健康保険', '厚生年金', '雇用保険', '労災保険'],
  '在留資格': [
    '永住者の配偶者等', '日本人の配偶者等', '永住者', '定住者', '技術・人文知識・国際業務', '特定技能', '技能実習', '留学', '特定活動', 'その他',
  ],
}

// ===== 行の正規化 =====
const trimAll = (s: string) => s.replace(/^[\s　]+|[\s　]+$/g, '')

// ラベル行の判定用：末尾の必須マーク（＊/*）と前後の空白を落とす
function normalizeLabel(line: string): string {
  return trimAll(trimAll(line).replace(/[＊*]+$/, ''))
    .replace(/[\s　]+/g, ' ')
    .replace(/\(/g, '(').replace(/\)/g, ')')
}

const LABEL_SET = new Set([...FIELD_LABELS, ...SECTION_HEADERS].map(normalizeLabel))
const HEADER_SET = new Set(SECTION_HEADERS.map(normalizeLabel))

// 値として意味を持たない画面上のノイズ行
function isNoise(line: string): boolean {
  const t = trimAll(line)
  if (!t) return true
  if (/^\d+\/\d+字$/.test(t)) return true                 // 45/100字
  if (/^[(（]\d+字以上.*[)）]$/.test(t)) return true       // (40字以上100字以内)
  if (/^[＊*]/.test(t)) return true                        // ＊複数選択可 / ＊求職者へ案内されます
  if (t === '郵便番号検索' || t === 'ー' || t === '―') return true
  if (/選択されていません/.test(t)) return true           // 画像欄
  if (/^(メイン画像|サブ画像\d+)/.test(t)) return true
  return false
}

// ===== 1行圧縮 =====
// 「270,000 / 円 / ～ / 450,000 / 円」のように分かれた行を「270,000円～450,000円」に戻す
const UNIT_RE = /^(円|歳|名|代|時間|分|締め|払い|[：:～〜＝=])$/
function compact(lines: string[]): string {
  let out = ''
  for (const raw of lines) {
    const t = trimAll(raw)
    if (!t) continue
    if (!out) { out = t; continue }
    if (UNIT_RE.test(t) || /[：:～〜＝=〒]$/.test(out)) out += t
    else out += ' ' + t
  }
  return out.replace(/\s*([：＝～〜])\s*/g, '$1').trim()
}

// 既知の選択肢で連結文字列を分割（完全に分割できた場合のみ区切りを入れる）
function splitOptions(value: string, options: string[]): string {
  const rest = value.replace(/[\s　]/g, '')
  const sorted = [...options].sort((a, b) => b.length - a.length)
  const picked: string[] = []
  let i = 0
  while (i < rest.length) {
    const hit = sorted.find(o => rest.startsWith(o, i))
    if (!hit) return value
    picked.push(hit)
    i += hit.length
  }
  return picked.join('、')
}

// ===== 本体：ラベル→値の列に分解 =====
function toEntries(text: string): Entry[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const entries: Entry[] = []
  let cur: { label: string; lines: string[] } | null = null
  const flush = () => {
    if (!cur) return
    const label = cur.label
    // 複数行項目は段落の空行を残す（ノイズ行だけ落とす）。1行項目は空行も含めて圧縮する
    const value = MULTILINE.has(label)
      ? cur.lines.filter(l => !trimAll(l) || !isNoise(l))
          .map(l => l.replace(/[\s　]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
      : compact(cur.lines.filter(l => !isNoise(l)))
    entries.push({ label, value })
    cur = null
  }

  for (const line of lines) {
    const norm = normalizeLabel(line)
    if (norm && LABEL_SET.has(norm)) {
      flush()
      cur = { label: norm, lines: [] }
      continue
    }
    // 「企業理念orビジョン」の直後に「の説明」が来る（ラベルが2行に割れている）
    if (cur && cur.label === '企業理念orビジョン' && norm === 'の説明' && cur.lines.every(isNoise)) {
      cur.label = '企業理念orビジョンの説明'
      continue
    }
    if (cur) cur.lines.push(line)
  }
  flush()
  return entries
}

// 同一ラベルが複数回出る（見出し兼用・面接ごと等）ため、空でない最初の値／全値を取る
// 「例）…」で始まる値は入力フォームのプレースホルダー（記入例）なので無視する
const isPlaceholder = (v: string) => /^例[）)]/.test(v)
function pick(entries: Entry[], label: string): string | undefined {
  const v = entries.find(e => e.label === label && e.value && !isPlaceholder(e.value))?.value
  return v || undefined
}
function pickAll(entries: Entry[], label: string): string[] {
  return entries.filter(e => e.label === label && e.value).map(e => e.value)
}

// 選考フロー：「No.1 / 選考チャット / CCT_...」のブロックを「1. 選考チャット：CCT_...」に整形
function formatSelectionFlow(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const steps: string[] = []
  let cur: string[] | null = null
  for (const line of raw.split('\n')) {
    const t = trimAll(line)
    const m = t.match(/^No\.?\s*(\d+)$/)
    if (m) { if (cur?.length) steps.push(cur.join('：')); cur = []; continue }
    if (!t) continue
    const cleaned = t.replace(/（チャット一覧から選択する）/, '').trim()
    if (cur) cur.push(cleaned)
    else steps.push(cleaned)
  }
  if (cur?.length) steps.push(cur.join('：'))
  if (!steps.length) return undefined
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
}

// 面接情報：N次面接ごとに「面接場所」「求職者への伝達事項」をまとめる
function formatInterviews(entries: Entry[]): string | undefined {
  const ROUND = /^(一|二|三|四|五|最終)次面接$/
  const rounds: { name: string; place?: string; info?: string }[] = []
  let cur: { name: string; place?: string; info?: string } | null = null
  for (const e of entries) {
    if (ROUND.test(e.label)) { cur = { name: e.label }; rounds.push(cur); continue }
    if (!cur) continue
    if (e.label === '面接場所' && e.value) cur.place = e.value
    if (e.label === '求職者への伝達事項' && e.value) cur.info = e.value
  }
  const parts: string[] = []
  const count = pick(entries, '面接回数')
  if (count) parts.push(`面接回数：${count}回`)
  for (const r of rounds) {
    if (!r.place && !r.info) continue
    const body = [r.place && `場所：${r.place}`, r.info].filter(Boolean).join('\n')
    parts.push(`■${r.name}\n${body}`)
  }
  return parts.length ? parts.join('\n\n') : undefined
}

// 「見出し：値」形式で1行にまとめる（値が無い項目は省く）
function kv(entries: Entry[], pairs: [string, string | undefined][]): string[] {
  return pairs.filter(([, v]) => v).map(([k, v]) => (v!.includes('\n') ? `${k}：\n${v}` : `${k}：${v}`))
}
const section = (title: string, lines: (string | undefined)[]): string | undefined => {
  const body = lines.filter(Boolean) as string[]
  return body.length ? `【${title}】\n${body.join('\n')}` : undefined
}

// ===== 公開API =====
export function parseJobText(text: string): ParsedJobText {
  const entries = toEntries(text)
  const matched = entries.filter(e => e.value && !HEADER_SET.has(e.label)).length
  const g = (label: string) => pick(entries, label)
  const opt = (label: string) => {
    const v = g(label)
    return v && OPTION_LISTS[label] ? splitOptions(v, OPTION_LISTS[label]) : v
  }

  // --- ヘッダー行：求人詳細 ○○ ＞ 企業名/エリア/求人名(ID)
  let company: string | undefined
  let title: string | undefined
  let jobId: string | undefined
  const header = text.match(/求人詳細[\s　]*(.*?)[\s　]*＞[\s　]*(.+)/)
  if (header) {
    const segs = header[2].trim().split('/')
    company = trimAll(header[1]) || trimAll(segs[0])
    if (segs.length >= 3) {
      title = trimAll(segs.slice(2).join('/'))
      const idm = title.match(/^(.*?)[\s　]*[(（](\d{4,})[)）]$/)
      if (idm) { title = idm[1]; jobId = idm[2] }
    } else if (segs.length === 2) {
      title = trimAll(segs[1])
    }
  }
  const isJobady = !!header || /ジョバディ/.test(text)

  company = company ?? g('企業名') ?? g('会社名') ?? g('就業先企業名')
  title = title ?? g('職種名') ?? g('職種')

  // --- 勤務地
  const addr = [g('都道府県'), g('市区町村'), g('番地以下')].filter(Boolean).join('')
  const area = addr || g('就業先住所')?.replace(/^〒?[\d-]+$/, '') || g('勤務地') || undefined

  // --- 年収／雇用形態／報酬
  const salary = g('年収') ?? g('初年度想定年収')
  const employment = g('雇用形態・期間')?.split(/\s+/)[0] ?? g('雇用形態')
  let feeRate = g('手数料') ?? g('紹介手数料')
  const fee = g('協力会社報酬予定金額')
  if (!feeRate && fee) {
    const n = fee.replace(/[^\d]/g, '')
    feeRate = n ? `${Number(n).toLocaleString('ja-JP')}円` : fee
  }

  // --- 詳細（見出し付きで結合）
  const overview = g('業務内容（概要）')
  const detailText = g('業務内容（詳細）') ?? g('仕事内容')
  const work = detailText && overview && detailText.startsWith(overview) ? detailText : [overview, detailText].filter(Boolean).join('\n\n')

  const probation = [g('試用期間'), pickAll(entries, '期間')[1], g('条件変更内容')].filter(Boolean).join(' ')
  const employmentFull = [g('雇用形態・期間'), pickAll(entries, '期間')[0] && `契約期間：${pickAll(entries, '期間')[0]}`].filter(Boolean).join('\n')

  const transit = ['公共交通機関①', '公共交通機関②', '公共交通機関③'].map(g).filter(Boolean).join('\n')
  const bizIndustry = [g('業界（大分類）'), g('業界（中分類）')].filter(Boolean).join(' ＞ ')

  const detailParts = [
    section('業務内容', [work || undefined]),
    section('1日の流れ', [g('1日の流れ')]),
    section('職場の雰囲気', [g('職場の雰囲気について')]),
    section('PRポイント', [g('PRポイント')]),
    section('求人の特徴', [g('求人の特徴')?.replace(/,/g, '、')]),
    section('募集情報', kv(entries, [
      ['掲載サイト', opt('掲載サイト')], ['求人状態', g('求人状態')], ['募集背景', opt('募集背景')],
      ['業界', g('業界')], ['職種', g('職種')], ['商材・サービス', g('商材・サービス')],
    ])),
    section('雇用形態', [employmentFull || g('雇用形態'), probation && `試用期間：${probation}`]),
    section('給与', kv(entries, [
      ['年収', g('年収')], ['初年度想定年収', g('初年度想定年収')], ['給与', g('給与')],
      ['賞与・昇給', g('賞与・昇給')], ['年収備考', g('年収備考')], ['給与備考', g('給与備考') ?? g('給与詳細')],
      ['交通費', g('交通費')], ['給与支払い日', g('給与支払い日')],
    ])),
    section('福利厚生', kv(entries, [
      ['手当', opt('福利厚生(手当)') ?? opt('福利厚生（手当）')], ['休暇', opt('福利厚生(休暇)') ?? opt('福利厚生（休暇）')],
      ['その他', g('その他福利厚生') ?? g('福利厚生')], ['加入保険', opt('加入保険')],
    ])),
    section('勤務時間・休日', kv(entries, [
      ['就業時間', g('就業時間')], ['休日', g('休日') ?? g('休日・休暇')], ['休憩時間', g('休憩時間')],
      ['時間外勤務', g('時間外勤務')], ['備考', g('就業時間・休日備考')],
    ])),
    section('応募条件', kv(entries, [
      ['入社日', g('入社日')], ['勤務時間', g('勤務時間')], ['必要な免許・資格', g('必要な免許・資格')],
      ['必要な経験・スキル', g('必要な経験・スキル') ?? g('応募条件')], ['NG条件', g('NG条件')],
      ['あれば尚可', g('あれば尚可な経験・資格等') ?? g('歓迎条件')],
    ])),
    section('ペルソナ', kv(entries, [
      ['年齢', g('年齢')], ['性別', g('性別')], ['外国籍', g('外国籍')], ['在留資格', opt('在留資格')],
      ['日本語レベル', g('日本語能力試験レベル＋日本語レベル')], ['その他条件', g('その他条件')],
    ])),
    section('勤務地', kv(entries, [
      ['就業先企業名', g('就業先企業名')], ['就業先部署名', g('就業先部署名')],
      ['住所', [g('就業先住所'), addr].filter(Boolean).join(' ') || undefined],
      ['勤務スタイル', g('勤務スタイル')], ['転勤', g('転勤')], ['自動車通勤', g('自動車通勤')], ['自転車通勤', g('自転車通勤')],
      ['交通', transit || undefined],
    ])),
    section('選考フロー', [formatSelectionFlow(g('選考フロー'))]),
    section('面接情報', [formatInterviews(entries)]),
    section('部署情報', kv(entries, [
      ['部署人数', g('部署人数')], ['年齢層', g('年齢層')], ['男女比', g('男女比')], ['服装', g('勤務時の服装')],
      ['採用予定人数', g('採用予定人数')], ['受動喫煙対策', g('受動喫煙対策')], ['就業場所', g('就業場所')],
      ['就業範囲', g('就業範囲')], ['特記事項', g('求人条件特記事項')],
    ])),
    section('企業情報', kv(entries, [
      ['業界', bizIndustry || undefined], ['事業内容', g('事業内容')], ['創業', g('創業')], ['資本金', g('資本金')],
      ['従業員規模', g('従業員規模')], ['上場区分', g('上場区分')], ['企業理念', g('企業理念orビジョン')],
      ['理念の説明', g('企業理念orビジョンの説明')],
    ])),
    section('寮・社宅', kv(entries, [
      ['部屋タイプ', g('部屋タイプ')], ['家具・備品', g('家具・備品')], ['家賃', g('家賃')], ['その他', g('その他')],
    ])),
    section('協力会社報酬', kv(entries, [
      ['報酬予定金額', feeRate && fee ? feeRate : undefined], ['早期退職規定', g('早期退職規定')],
    ])),
  ].filter(Boolean) as string[]

  // --- メモ：求人ID・更新日時など媒体側の管理情報
  const updated = text.match(/更新日時[：:]\s*([\d/.-]+)/)?.[1]
  const noteParts = [
    jobId && `ジョバディ求人ID：${jobId}`,
    updated && `求人票更新日時：${updated}`,
    /プレミアム求人/.test(text) ? 'プレミアム求人' : undefined,
  ].filter(Boolean) as string[]

  return {
    company, title, area, salary, employment, feeRate,
    detail: detailParts.length ? detailParts.join('\n\n') : undefined,
    note: noteParts.length ? noteParts.join('\n') : undefined,
    source: isJobady ? 'jobady' : 'manual',
    matched,
  }
}
