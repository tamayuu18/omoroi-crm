// PDFの「表」を読むための汎用レイアウト抽出。
//
// pdfjs でテキスト（位置付き）と、罫線として描かれた細い矩形・線を取り出し、
// 各テキストを「上下左右の最も近い罫線」で囲まれたセルに割り当てる。
// これにより、HTMLの表を印刷したPDF（求人票など）を「ラベルセル → 右隣の値セル」として扱える。
//
// 依存: pdfjs-dist（legacy build。Node/サーバーレスで動くようワーカー無しで使う）

import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

// テキストの連なり（同一行で隙間なく隣接する文字列をまとめたもの）。座標は左上原点・pt単位
export type TextRun = {
  page: number
  x: number      // 左端
  y: number      // ベースライン（上からの距離）
  w: number
  h: number      // フォントサイズ相当
  text: string
}

// セル内の1行
export type CellLine = {
  text: string
  x: number       // 行の左端
  right: number   // 行の右端
  y: number
  h: number
  runs: TextRun[]
}

// 罫線（水平なら y1===y2、垂直なら x1===x2）
type Segment = { page: number; x1: number; y1: number; x2: number; y2: number }

export type Cell = {
  page: number
  left: number
  top: number
  right: number
  bottom: number
  broken: boolean     // 罫線が重なって描かれていて、上下の境界を特定できなかったセル
  runs: TextRun[]
  lines: CellLine[]   // セル内のテキスト行（上から順）
  text: string        // 行テキストを改行で結合したもの
}

export type PdfLayout = {
  pageCount: number
  pageWidth: number
  pageHeight: number
  runs: TextRun[]        // ヘッダー・フッターを含む全テキスト
  cells: Cell[]          // 表のセル（ヘッダー・フッター除外）
  text: string           // 全文（読み順のまま。正規表現での抽出用）
}

const THIN = 1.5           // これ以下の太さの矩形・線を罫線とみなす(pt)
const HEADER_FOOTER = 30   // ページ上下この幅はヘッダー/フッターとして表から除外(pt)

type Matrix = [number, number, number, number, number, number]

function mul(m1: Matrix, m2: Matrix): Matrix {
  // m2 を適用してから m1 を適用する合成（pdfjs の transform 演算と同じ順序）
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

// 康熙部首（U+2F00〜）など、見た目が同じ別コードポイントを通常の漢字に揃える
// （ブラウザ印刷のPDFでフォント置換により「力」が「⼒」になっていることがある）
export function normalizeGlyphs(s: string): string {
  return s.replace(/[⺀-⻳⼀-⿕]/g, c => c.normalize('NFKC'))
}

// pdfjs の constructPath が持つパスデータから各サブパスの外接矩形を取り出す
// データ形式: [op, x, y, ...] の繰り返し。op: 0=moveTo 1=lineTo 2=curveTo(6値) 3=quadTo(4値) 4=closePath
function subpathBoxes(path: ArrayLike<number>): { minX: number; minY: number; maxX: number; maxY: number }[] {
  const boxes: { minX: number; minY: number; maxX: number; maxY: number }[] = []
  let cur: { minX: number; minY: number; maxX: number; maxY: number } | null = null
  const add = (x: number, y: number) => {
    if (!cur) cur = { minX: x, minY: y, maxX: x, maxY: y }
    else {
      cur.minX = Math.min(cur.minX, x); cur.maxX = Math.max(cur.maxX, x)
      cur.minY = Math.min(cur.minY, y); cur.maxY = Math.max(cur.maxY, y)
    }
  }
  let i = 0
  while (i < path.length) {
    const op = path[i++]
    if (op === 0) { if (cur) boxes.push(cur); cur = null; add(path[i], path[i + 1]); i += 2 }
    else if (op === 1) { add(path[i], path[i + 1]); i += 2 }
    else if (op === 2) { add(path[i], path[i + 1]); add(path[i + 2], path[i + 3]); add(path[i + 4], path[i + 5]); i += 6 }
    else if (op === 3) { add(path[i], path[i + 1]); add(path[i + 2], path[i + 3]); i += 4 }
    else if (op === 4) { /* close */ }
    else break // 未知のデータ形式。以降は読まない
  }
  if (cur) boxes.push(cur)
  return boxes
}

const DRAW_OPS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.stroke, OPS.closeStroke])

type PageProxy = Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>
type ToView = (x: number, y: number) => [number, number]

// 1ページ分の罫線を取り出す（塗りつぶし矩形・線のうち細いもの。点線は点を連結して1本にする）
async function extractSegments(page: PageProxy, pageNo: number, toView: ToView): Promise<Segment[]> {
  const ol = await page.getOperatorList()
  const segs: Segment[] = []
  const dots: { x: number; y: number }[] = []
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]
    const args = ol.argsArray[i]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix)
    else if (fn === OPS.constructPath) {
      // args = [描画op, パスデータ（Float32Array の配列）, 外接矩形]
      const [op, pathArrays] = args as [number, ArrayLike<number>[] | ArrayLike<number>]
      if (!DRAW_OPS.has(op) || !pathArrays) continue
      const parts: ArrayLike<number>[] = Array.isArray(pathArrays) && pathArrays.length && typeof pathArrays[0] !== 'number'
        ? (pathArrays as ArrayLike<number>[]) : [pathArrays as ArrayLike<number>]
      for (const b of parts.flatMap(subpathBoxes)) {
        // 4隅を変換してページ座標（左上原点）の外接矩形にする
        const pts = [apply(ctm, b.minX, b.minY), apply(ctm, b.maxX, b.minY), apply(ctm, b.minX, b.maxY), apply(ctm, b.maxX, b.maxY)].map(([x, y]) => toView(x, y))
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
        const w = maxX - minX, h = maxY - minY
        if (w <= THIN && h <= THIN) dots.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 })
        else if (h <= THIN && w > 3) segs.push({ page: pageNo, x1: minX, y1: (minY + maxY) / 2, x2: maxX, y2: (minY + maxY) / 2 })
        else if (w <= THIN && h > 3) segs.push({ page: pageNo, x1: (minX + maxX) / 2, y1: minY, x2: (minX + maxX) / 2, y2: maxY })
      }
    }
  }

  // 点線: 同じ y（または x）に並ぶ点を連結し、十分な長さなら罫線扱い
  const chain = (key: 'x' | 'y', other: 'x' | 'y') => {
    const groups = new Map<number, number[]>()
    for (const d of dots) {
      const k = Math.round(d[key] * 2) / 2
      const g = groups.get(k) ?? []
      g.push(d[other]); groups.set(k, g)
    }
    for (const [k, vals] of groups) {
      vals.sort((a, b) => a - b)
      let start = vals[0], prev = vals[0]
      const flush = () => {
        if (prev - start >= 15) {
          segs.push(key === 'y'
            ? { page: pageNo, x1: start, y1: k, x2: prev, y2: k }
            : { page: pageNo, x1: k, y1: start, x2: k, y2: prev })
        }
      }
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] - prev > 4) { flush(); start = vals[i] }
        prev = vals[i]
      }
      flush()
    }
  }
  chain('y', 'x')
  chain('x', 'y')
  return segs
}

// テキスト項目のうち、同じ行で隙間なく続くものを1つの TextRun に連結する。
// 文字どうしが重なっている（別の文字列が同じ場所に描かれている）場合は連結しない。
type TextItemLike = { str: string; transform: number[]; width: number; height: number }

function buildRuns(items: TextItemLike[], pageNo: number, toView: ToView): TextRun[] {
  const raw = items
    .filter(it => it.str.trim())
    .map(it => {
      const [x, y] = toView(it.transform[4], it.transform[5])
      const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 10
      return { page: pageNo, x, y, w: it.width, h, text: normalizeGlyphs(it.str) }
    })
    .sort((a, b) => (Math.abs(a.y - b.y) <= 2 ? a.x - b.x : a.y - b.y))

  const runs: TextRun[] = []
  let line: TextRun[] = []
  let lineY = NaN
  for (const it of raw) {
    if (!(Math.abs(it.y - lineY) <= 2)) { line = []; lineY = it.y }
    // 同じ行で、右端がこの項目の左端にぴったり接している run を探して連結する
    const target = line.find(r => { const gap = it.x - (r.x + r.w); return gap >= -1 && gap <= 1.5 })
    if (target) {
      target.text += it.text
      target.w = it.x + it.w - target.x
    } else {
      const run: TextRun = { ...it }
      runs.push(run)
      line.push(run)
    }
  }
  return runs
}

// 同じベースラインの run を x 順に結合して1行にする
function buildLine(runs: TextRun[]): CellLine {
  const sorted = [...runs].sort((a, b) => a.x - b.x)
  let s = ''
  let prev: TextRun | undefined
  for (const r of sorted) {
    if (prev) s += r.x - (prev.x + prev.w) > 2 ? ' ' : ''
    s += r.text
    prev = r
  }
  const last = sorted[sorted.length - 1]
  return {
    text: s.replace(/\s+/g, ' ').trim(),
    x: sorted[0].x,
    right: last.x + last.w,
    y: sorted[0].y,
    h: Math.max(...sorted.map(r => r.h)),
    runs: sorted,
  }
}

export function linesOf(runs: TextRun[]): CellLine[] {
  const sorted = [...runs].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
  const groups: TextRun[][] = []
  for (const r of sorted) {
    const g = groups[groups.length - 1]
    if (g && g[0].page === r.page && Math.abs(g[0].y - r.y) <= 2.5) g.push(r)
    else groups.push([r])
  }
  return groups.map(buildLine).filter(l => l.text)
}

// セル幅いっぱいまで文字が詰まっている行は、次の行と同じ段落として連結する
// （印刷時の自動折り返しを元に戻す）。日本語同士はそのまま、英数字の間は空白で繋ぐ。
// 行末が句点などで終わる行や、次の行が箇条書き記号で始まる場合は段落の切れ目とみなして連結しない。
export function unwrapLines(lines: CellLine[], cellRight: number): string[] {
  const out: string[] = []
  let buf = ''
  let wrapped = false
  const latin = (c: string) => /^[A-Za-z]$/.test(c)
  const endsParagraph = (s: string) => /[。！？!?）」』】〕》〉]$/.test(s)
  const startsItem = (s: string) => /^[★☆■□●○◆◇▼▲※・＜≪【〔《〈「『(（\-－]/.test(s)
  for (const l of lines) {
    if (wrapped && buf && !endsParagraph(buf) && !startsItem(l.text)) {
      buf += (latin(buf[buf.length - 1]) && latin(l.text[0]) ? ' ' : '') + l.text
    } else {
      if (buf) out.push(buf)
      buf = l.text
    }
    // 右端の余白が「2文字＋セル余白」未満なら、次の語が入らず折り返されたとみなす
    wrapped = cellRight - l.right < l.h * 2.4 + 5
  }
  if (buf) out.push(buf)
  return out
}

function modeOf(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0] ?? 10, bestN = 0
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n }
  return best
}

export async function extractPdfLayout(data: Uint8Array): Promise<PdfLayout> {
  const task = getDocument({ data, useSystemFonts: false, disableFontFace: true })
  const doc = await task.promise
  try {
    const allRuns: TextRun[] = []
    const allSegs: Segment[] = []
    let pageWidth = 0, pageHeight = 0
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const vp = page.getViewport({ scale: 1 })
      pageWidth = vp.width; pageHeight = vp.height
      const toView: ToView = (x, y) => {
        const [vx, vy] = vp.convertToViewportPoint(x, y)
        return [vx, vy]
      }
      const tc = await page.getTextContent()
      // items には TextItem のほか TextMarkedContent（str を持たない）が混ざるので除く
      const items = tc.items.filter(it => 'str' in it) as TextItemLike[]
      allRuns.push(...buildRuns(items, p, toView))
      allSegs.push(...await extractSegments(page, p, toView))
      page.cleanup()
    }

    // ---- セル割り当て ----
    // ヘッダー/フッター、および本文より明らかに大きい文字（表題・章見出し）は表のセルに入れない
    const inPage = allRuns.filter(r => r.y > HEADER_FOOTER && r.y < pageHeight - HEADER_FOOTER)
    const bodyH = modeOf(inPage.map(r => Math.round(r.h * 2) / 2))
    const cellMap = new Map<string, Cell>()
    const body = inPage.filter(r => r.h <= bodyH * 1.1)
    for (const r of body) {
      const cx = r.x + Math.min(r.w / 2, 5)
      const cy = r.y - r.h * 0.35
      const segs = allSegs.filter(s => s.page === r.page)
      let left = 0, right = pageWidth, top = 0, bottom = pageHeight
      for (const s of segs) {
        if (s.x1 === s.x2) {
          // 垂直線
          if (s.y1 - 1 <= cy && cy <= s.y2 + 1) {
            if (s.x1 <= cx && s.x1 > left) left = s.x1
            if (s.x1 >= cx && s.x1 < right) right = s.x1
          }
        } else if (s.y1 === s.y2) {
          if (s.x1 - 1 <= cx && cx <= s.x2 + 1) {
            if (s.y1 <= cy && s.y1 > top) top = s.y1
            if (s.y1 >= cy && s.y1 < bottom) bottom = s.y1
          }
        }
      }
      // 文字の高さより低いセルは罫線が重なって描かれた不正なもの。上下の罫線は無視する
      let broken = false
      if (bottom - top < r.h) { top = 0; bottom = pageHeight; broken = true }
      const key = `${r.page}:${Math.round(left)}:${Math.round(top)}:${Math.round(right)}:${Math.round(bottom)}`
      const cell = cellMap.get(key) ?? { page: r.page, left, top, right, bottom, broken, runs: [], lines: [], text: '' }
      cell.runs.push(r)
      cellMap.set(key, cell)
    }

    // ---- ページまたぎの結合 ----
    // ページ先頭にあり上罫線が無いセル（前ページの行の続き）は、前ページ末尾の「下罫線が無いセル」で
    // 横位置が重なるものへ連結する（表の1行がページをまたいで印刷された場合）
    let cells = [...cellMap.values()]
    for (const c of cells.filter(c => c.page > 1 && c.top === 0 && c.left > 0 && c.right < pageWidth)) {
      if (Math.min(...c.runs.map(r => r.y)) > HEADER_FOOTER + 40) continue
      const xs = c.runs.map(r => r.x)
      const prev = cells.find(p =>
        p.page === c.page - 1 && p.bottom >= pageHeight - HEADER_FOOTER - 40 && p.left > 0 && p.right < pageWidth &&
        Math.min(p.right, c.right) - Math.max(p.left, c.left) > (c.right - c.left) * 0.5 &&
        // 行頭の位置が前ページの行頭と揃っていること（同じ段組みの続きであること）
        p.runs.some(r => xs.some(x => Math.abs(x - r.x) <= 3)))
      if (prev) {
        prev.runs.push(...c.runs)
        cells = cells.filter(x => x !== c)
      }
    }

    for (const c of cells) {
      c.lines = linesOf(c.runs)
      c.text = c.lines.map(l => l.text).join('\n')
    }
    cells.sort((a, b) => a.page - b.page || a.top - b.top || a.left - b.left)

    const text = linesOf(allRuns).map(l => l.text).join('\n')
    return { pageCount: doc.numPages, pageWidth, pageHeight, runs: allRuns, cells, text }
  } finally {
    await task.destroy()
  }
}
