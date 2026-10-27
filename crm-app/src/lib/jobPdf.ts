// jobuddy の求人票PDF（管理画面「求人票」をブラウザ印刷したもの）から Job フォームの下書きを作る。
//
// 求人票は「ラベル | 値」の表なので、pdfLayout で罫線からセルを復元し、
// ラベルセルの右隣のセルを値として読む。印刷時にセルが重なって崩れる箇所
// （就業場所・福利厚生・加入保険のブロック）は、罫線に頼らず行の位置関係から読む。

import { extractPdfLayout, linesOf, unwrapLines, type Cell, type CellLine, type PdfLayout, type TextRun } from './pdfLayout'
import type { JobDraft } from './jobScrape'

// 求人票に現れるラベル（セル内の文字列がこれに一致したらラベルセルとみなす）
const LABELS = [
  '事業所名', '従業員数', '設立', '資本金', '所在地', '代表者名', '事業内容', '会社の特長', 'ホームページ',
  '就業形態', '職種', '仕事の内容', '必要な知識・経験等（履修科目）',
  '就業場所', '福利厚生等', '加入保険等', '転勤の可能性', '賃金締切日', '賃金支払日', '締切日', '支払日', 'マイカー通勤', '受動喫煙対策',
  '賃金等', '賃金', '基本給', '月給', '給与備考', '年収備考', '支払われる手当', '賞与', '昇給',
  '就業時間', '時間外', '月平均', '就業時間・休日備考', '休日等', '休日', '休業時間',
  '雇用期間', '期間', '試用期間', '条件変更内容',
]

const norm = (s: string) => s.replace(/[\s　]/g, '')
const sortedChars = (s: string) => [...norm(s)].sort().join('')
const LABEL_BY_NORM = new Map(LABELS.map(l => [norm(l), l]))
// 縦書きラベルが2列に折り返されていると文字順が崩れるので、文字の集合でも照合する
const LABEL_BY_CHARS = new Map(LABELS.map(l => [sortedChars(l), l]))

function matchLabel(s: string): string | undefined {
  const n = norm(s)
  if (!n) return undefined
  return LABEL_BY_NORM.get(n) ?? LABEL_BY_CHARS.get(sortedChars(n))
}

// セルから見つかったラベル。value はラベルと同じセルに値が書かれている場合（見出し付きセル・1行内のラベル）
type LabelEntry = { name: string; cell: Cell; value?: string }

// 短い run が縦に並んだもの（縦書きラベル）をまとめる。中心xが揃っていて、縦に連続しているものを1グループとする
function verticalStacks(runs: TextRun[]): TextRun[][] {
  const short = runs.filter(r => r.text.length <= 3 && r.w <= r.h * 3.2).sort((a, b) => a.y - b.y)
  const stacks: TextRun[][] = []
  for (const r of short) {
    const cx = r.x + r.w / 2
    const s = stacks.find(st => {
      const last = st[st.length - 1]
      return Math.abs(last.x + last.w / 2 - cx) <= 4 && r.y - last.y > 2 && r.y - last.y <= r.h * 2.2
    })
    if (s) s.push(r)
    else stacks.push([r])
  }
  return stacks.filter(s => s.length >= 2)
}

function cellValueText(cell: Cell): string {
  return unwrapLines(cell.lines, cell.right).join('\n').trim()
}

function linesText(lines: CellLine[], right: number): string {
  return unwrapLines(lines, right).join('\n').trim()
}

// 各セルをラベルとして解釈する（1セルに複数のラベルが入っていることもある）
function findLabels(cells: Cell[]): LabelEntry[] {
  const entries: LabelEntry[] = []
  for (const cell of cells) {
    // 1) セル全体がラベル
    const whole = matchLabel(cell.text)
    if (whole) { entries.push({ name: whole, cell }); continue }

    // 2) 縦書きラベル + 値が同じセルに入っている（罫線が無い内側の表など）
    let rest = cell.runs
    let found = false
    for (const st of verticalStacks(cell.runs)) {
      const name = matchLabel(st.map(r => r.text).join(''))
      if (!name) continue
      rest = rest.filter(r => !st.includes(r))
      found = true
      entries.push({ name, cell, value: linesText(linesOf(rest), cell.right) })
    }
    if (found) continue

    // 3) 見出し付きセル（1行目がラベル、2行目以降が値）
    const first = cell.lines[0]
    const headed = matchLabel(first.text)
    if (headed && cell.lines.length > 1) {
      entries.push({ name: headed, cell, value: linesText(cell.lines.slice(1), cell.right) })
      continue
    }
    // 4) 1行目の先頭 run がラベルで、同じ行に値が続く（「基本給 3,600,000円」など）
    const inline = first.runs.length >= 2 ? matchLabel(first.runs[0].text) : undefined
    if (inline) {
      const restRuns = cell.runs.filter(r => r !== first.runs[0])
      entries.push({ name: inline, cell, value: linesText(linesOf(restRuns), cell.right) })
    }
  }
  return entries
}

class JobSheet {
  private layout: PdfLayout
  private labels: LabelEntry[]
  private labelCells: Set<Cell>
  constructor(layout: PdfLayout) {
    this.layout = layout
    this.labels = findLabels(layout.cells)
    this.labelCells = new Set(this.labels.map(l => l.cell))
  }

  // あるセルの右隣に接するセル（上から順）
  rightCells(cell: Cell): Cell[] {
    return this.layout.cells
      .filter(c => c.page === cell.page && !c.broken && Math.abs(c.left - cell.right) <= 2 &&
        Math.min(c.bottom, cell.bottom) - Math.max(c.top, cell.top) > 2)
      .sort((a, b) => a.top - b.top)
  }

  entries(name: string, within?: Cell): LabelEntry[] {
    return this.labels
      .filter(l => l.name === name)
      .filter(l => !within || (l.cell.page === within.page && l.cell.left >= within.right - 2 &&
        Math.min(l.cell.bottom, within.bottom) - Math.max(l.cell.top, within.top) > 2))
      .sort((a, b) => a.cell.page - b.cell.page || a.cell.left - b.cell.left || a.cell.top - b.cell.top)
  }

  // ラベル名から値を得る。within を渡すと、そのセルの右側にある同名ラベルに限定する（入れ子の表用）
  valueOf(name: string, within?: Cell): string | undefined {
    for (const e of this.entries(name, within)) {
      if (e.value !== undefined) { if (e.value) return e.value; continue }
      for (const c of this.rightCells(e.cell)) {
        if (this.labelCells.has(c)) continue
        const v = cellValueText(c)
        if (v) return v
      }
    }
    return undefined
  }

  labelCell(name: string): Cell | undefined {
    return this.entries(name)[0]?.cell
  }

  isLabelCell(c: Cell): boolean {
    return this.labelCells.has(c)
  }
}

const KATAKANA_ONLY = /^[゠-ヿㇰ-ㇿー・\s（）()]+$/

// 「3,600,000～6,000,000円」→「360万円〜600万円」
function toManYen(s: string): string | undefined {
  const nums = [...s.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s*円?/g)].map(m => Number(m[1].replace(/,/g, '')))
  const vals = nums.filter(n => n >= 10000)
  if (!vals.length) return undefined
  const fmt = (n: number) => {
    const man = n / 10000
    return (Number.isInteger(man) ? String(man) : man.toFixed(1)) + '万円'
  }
  return vals.length >= 2 ? `${fmt(vals[0])}〜${fmt(vals[1])}` : fmt(vals[0])
}

// 1文字だけの run で、同じ x に他の1文字 run が縦に並んでいるもの（縦書きラベルの一部）
function isStackedChar(r: TextRun, runs: TextRun[]): boolean {
  if (r.text.length !== 1) return false
  const n = runs.filter(o => o !== r && o.page === r.page && o.text.length === 1 &&
    Math.abs(o.x - r.x) <= 2 && Math.abs(o.y - r.y) > 2 && Math.abs(o.y - r.y) <= 30).length
  return n >= 2
}

// 労働条件のうち、印刷で崩れる「就業場所／福利厚生等／加入保険等／転勤の可能性」のブロックを行単位で読む。
// 基本給の行より上、〒（郵便番号）の行以降を対象にし、右側のミニ表（賃金締切日など）は除く。
function parseConditionsBlock(layout: PdfLayout, sheet: JobSheet): { area?: string; welfare?: string; insurance?: string; transfer?: string } {
  const base = sheet.labelCell('基本給')
  if (!base) return {}
  const page = base.page
  const limitY = base.top
  const pageRuns = layout.runs.filter(r => r.page === page && r.y > 30 && r.y < limitY - 1)
  const postal = pageRuns.find(r => r.text.startsWith('〒'))
  const header = pageRuns.find(r => /労\s*働\s*条\s*件/.test(r.text))
  const startY = postal ? postal.y - 4 : header ? header.y + 4 : 0
  // ミニ表の左端はラベルの x の中央値で決める（崩れた印刷で一部のラベルが左にずれていることがある）
  const miniXs = pageRuns.filter(r => /^(賃金|締切日|支払日|マイカー通勤|受動喫煙対策|就業形態)$/.test(norm(r.text)) && r.y >= startY)
    .map(r => r.x).sort((a, b) => a - b)
  const miniX = miniXs.length ? miniXs[Math.floor(miniXs.length / 2)] - 2 : layout.pageWidth
  const block = pageRuns.filter(r => r.y >= startY && r.x < miniX && !isStackedChar(r, pageRuns))
  const lines = linesOf(block).filter(l => !matchLabel(l.text))
  const used = new Set<CellLine>()

  let area: string | undefined
  const postalLine = lines.find(l => l.text.includes('〒'))
  if (postalLine) {
    const parts = [postalLine]
    used.add(postalLine)
    for (const l of lines) {
      if (l === postalLine || l.y <= postalLine.y) continue
      if (l.y - postalLine.y <= 24 && Math.abs(l.x - postalLine.x) <= 3) { parts.push(l); used.add(l) }
    }
    area = parts.map(l => l.text).join(' ').replace(/〒\s*/, '〒').trim()
  }

  let transfer: string | undefined
  for (const l of lines) {
    const m = l.text.match(/転勤の可能性\s*(\S+)/)
    if (m) { transfer = m[1].trim(); used.add(l) }
  }

  let insurance: string | undefined
  for (const l of lines) {
    if (used.has(l) || !/保険/.test(l.text)) continue
    insurance = l.text.replace(/^加入保険等\s*/, '').trim()
    used.add(l)
  }

  const welfareLines = lines.filter(l => !used.has(l))
  const welfare = welfareLines.length ? welfareLines.map(l => l.text).join('') : undefined
  return { area, welfare, insurance, transfer }
}

const section = (label: string, v: string | undefined) => (v ? `【${label}】\n${v}` : undefined)
const item = (label: string, v: string | undefined) => (v ? (v.includes('\n') ? `${label}:\n${v}` : `${label}: ${v}`) : undefined)
const lines = (...parts: (string | undefined)[]) => parts.filter(Boolean).join('\n')

export function isJobuddySheet(layout: PdfLayout): boolean {
  return /jobuddy/i.test(layout.text) || (/求人票/.test(layout.text) && /案件番号/.test(layout.text))
}

export function parseJobuddySheet(layout: PdfLayout): JobDraft {
  const sheet = new JobSheet(layout)
  const text = layout.text
  const draft: JobDraft = { source: 'jobuddy', sourceUrl: '' }

  const caseNo = text.match(/案件番号\s*[：:]\s*([0-9A-Za-z-]+)/)?.[1]
  const footerUrl = layout.runs.find(r => r.y > layout.pageHeight - 30 && /^https?:\/\//.test(r.text))?.text
  draft.sourceUrl = footerUrl ?? ''

  // 企業名（フリガナ行があれば除く）
  const nameCell = sheet.labelCell('事業所名')
  if (nameCell) {
    const texts = sheet.rightCells(nameCell).flatMap(c => c.lines.map(l => l.text))
    draft.company = texts.find(t => !KATAKANA_ONLY.test(t)) ?? texts[0]
  }

  // 職種（大分類セル → 職種セルの順に並ぶ）
  let category: string | undefined
  const jobCell = sheet.labelCell('職種')
  if (jobCell) {
    const r1 = sheet.rightCells(jobCell)[0]
    const r2 = r1 ? sheet.rightCells(r1)[0] : undefined
    const t1 = r1 ? cellValueText(r1) : undefined
    const t2 = r2 ? cellValueText(r2) : undefined
    if (t2) { draft.title = t2; category = t1 } else draft.title = t1
  }

  draft.employment = sheet.valueOf('就業形態')

  const baseSalary = sheet.valueOf('基本給')
  const monthly = sheet.valueOf('月給')
  draft.salary = baseSalary ? (toManYen(baseSalary) ?? baseSalary) : undefined

  const cond = parseConditionsBlock(layout, sheet)
  draft.area = cond.area ?? sheet.valueOf('就業場所') ?? sheet.valueOf('所在地')

  // 従業員数は「企業全体 | 100～200人未満」のように見出しセルと値セルが縦に並ぶ
  let employees: string | undefined
  const empCell = sheet.labelCell('従業員数')
  if (empCell) {
    const vals = sheet.rightCells(empCell).map(cellValueText).filter(Boolean)
    employees = vals.length >= 2 ? `${vals[vals.length - 1]}（${vals[0]}）` : vals[0]
  }

  const trial = sheet.labelCell('試用期間')
  const trialValue = trial && sheet.valueOf('試用期間')
  const trialPeriod = trial && sheet.valueOf('期間', trial)
  const trialChange = trial && sheet.valueOf('条件変更内容', trial)
  const overtime = sheet.valueOf('時間外')
  const overtimeAvg = sheet.valueOf('月平均')

  draft.detail = lines(
    caseNo ? `案件番号: ${caseNo}` : undefined,
    section('職種分類', category),
    section('仕事内容', sheet.valueOf('仕事の内容')),
    section('必要な経験・知識', sheet.valueOf('必要な知識・経験等（履修科目）')),
    section('給与', lines(
      item('基本給', baseSalary),
      item('月給', monthly),
      item('給与備考', sheet.valueOf('給与備考')),
      item('年収備考', sheet.valueOf('年収備考')),
      item('支払われる手当', sheet.valueOf('支払われる手当')),
      item('賞与', sheet.valueOf('賞与')),
      item('昇給', sheet.valueOf('昇給')),
    )),
    section('就業時間', lines(
      sheet.valueOf('就業時間'),
      item('時間外', overtime && overtimeAvg ? `${overtime}（月平均 ${overtimeAvg}）` : overtime ?? overtimeAvg),
      item('休憩時間', sheet.valueOf('休業時間')),
    )),
    section('休日・休暇', lines(
      sheet.valueOf('休日'),
      sheet.valueOf('就業時間・休日備考'),
    )),
    section('就業場所', draft.area),
    section('福利厚生', lines(
      cond.welfare ?? sheet.valueOf('福利厚生等'),
      item('加入保険', cond.insurance ?? sheet.valueOf('加入保険等')),
      item('転勤の可能性', cond.transfer ?? sheet.valueOf('転勤の可能性')),
      item('マイカー通勤', sheet.valueOf('マイカー通勤') ?? text.match(/マイカー通勤\s+(\S+)/)?.[1]),
      item('受動喫煙対策', sheet.valueOf('受動喫煙対策') ?? text.match(/受動喫煙対策(?:\s*支払日)?\s*((?:あり|なし)\S*)/)?.[1]),
    )),
    section('雇用期間', lines(
      sheet.valueOf('雇用期間'),
      item('試用期間', [trialValue, trialPeriod, trialChange].filter(Boolean).join('／') || undefined),
    )),
    section('企業情報', lines(
      item('従業員数', employees),
      item('設立', sheet.valueOf('設立')),
      item('資本金', sheet.valueOf('資本金')),
      item('代表者', sheet.valueOf('代表者名')),
      item('事業内容', sheet.valueOf('事業内容')),
      item('会社の特長', sheet.valueOf('会社の特長')),
      item('ホームページ', sheet.valueOf('ホームページ')),
      item('所在地', sheet.valueOf('所在地')?.replace(/〒\s+/, '〒').replace(/\n/g, ' ')),
    )),
  ) || undefined

  return draft
}

// PDFのバイト列から求人下書きを作る。jobuddy 求人票として読めない場合は全文を詳細欄に入れて返す。
export async function parseJobPdf(data: Uint8Array): Promise<JobDraft> {
  const layout = await extractPdfLayout(data)
  if (isJobuddySheet(layout)) {
    const draft = parseJobuddySheet(layout)
    if (draft.company || draft.title) {
      draft._debug = { fetched: true, extracted: true }
      return draft
    }
  }
  const fallback = layout.text.trim()
  return {
    source: 'manual',
    sourceUrl: '',
    detail: fallback.slice(0, 20000) || undefined,
    _debug: {
      fetched: true,
      extracted: false,
      error: fallback ? 'jobuddy の求人票として読み取れませんでした（PDFの本文を詳細欄に入れました）' : 'PDFから文字を取り出せませんでした（画像のみのPDFの可能性）',
    },
  }
}
