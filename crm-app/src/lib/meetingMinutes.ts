import { prisma } from '@/lib/prisma'

export type Extracted = {
  personName: string
  kana?: string
  email?: string
  phone?: string
  minutes: string        // 議事録本文（markdown）
  result?: string        // 面談結果の1〜2文サマリ
  nextAction?: string    // 次回アクション
  nextDeadline?: string  // 次回期日 'YYYY-MM-DD'（無ければ ''）
}

// 使用モデルは環境変数で変更可能。現行のモデルIDに合わせて設定してください。
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

/* ------------------------------------------------------------------ *
 * ファイル名から「顧客（求職者）」の氏名を推定する
 *
 * 実際のNottaのファイル名は次のような形です。先頭はCA（担当者）の名前で、
 * 顧客名はコロンまたはスラッシュのあとに来ます。
 *
 *   笠原拓実 面談: 金子萌々様 - 2026-07-25 10:19:35
 *   新　面談:折田天海さん - 2026-07-23 10:34:26
 *   岩田/　山岸さん2回目面談 - 2026-07-22 17:24:04
 *   岩田/廣瀬さん　状況確認面談 - 2026-07-24 13:02:11
 *   Google Meetからの新しいノート - 2026-07-20 09:00:00   ← 顧客名なし
 * ------------------------------------------------------------------ */

/** 用件・種別をあらわす語（氏名ではない） */
const TOPIC_WORDS =
  /(面談|面接対策|面接|議事録|初回|二次|三次|\d+\s*回目|フォロー(アップ)?|MTG|ミーティング|打ち?合わせ|商談|状況確認|進捗確認|相談|ヒアリング|定例|振り返り|キャリア|オンライン|電話|zoom|meet|notta|録音|文字起こし|新規|再面談|顔合わせ|条件確認|内定|選考)/gi

/** 顧客名を含まないことが確定しているファイル名 */
const NO_NAME_TITLE =
  /(Google\s*Meet|新しいノート|無題|Untitled|New\s*Recording|名称未設定)/i

/** ファイル名から顧客（求職者）の氏名候補を推定。取れなければ '' を返す。 */
export function guessNameFromFileName(fileName: string): string {
  let s = fileName.replace(/\.[a-zA-Z0-9]+$/, '') // 拡張子

  // 末尾の " - 2026-07-25 10:19:35" を丸ごと落とす
  s = s.replace(
    /\s*[-–—ー]\s*\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2}日?(\s+\d{1,2}[:：]\d{2}([:：]\d{2})?)?\s*$/,
    ' '
  )
  // 残った日付・時刻
  s = s.replace(/\d{4}[-/年.]?\d{1,2}[-/月.]?\d{1,2}日?/g, ' ')
  s = s.replace(/\d{1,2}[:：]\d{2}([:：]\d{2})?/g, ' ')
  // 括弧書き（（2回目）など）
  s = s.replace(/[（(【[｛{].*?[)）】\]｝}]/g, ' ')
  s = s.replace(/[　\s]+/g, ' ').trim()

  if (!s) return ''
  if (NO_NAME_TITLE.test(s)) return ''

  // 顧客名は「コロンのあと」→ 無ければ「スラッシュのあと」に来る
  let seg = s
  const colon = Math.max(seg.lastIndexOf(':'), seg.lastIndexOf('：'))
  if (colon >= 0 && seg.slice(colon + 1).trim()) {
    seg = seg.slice(colon + 1)
  } else {
    const slash = Math.max(seg.lastIndexOf('/'), seg.lastIndexOf('／'))
    if (slash >= 0 && seg.slice(slash + 1).trim()) seg = seg.slice(slash + 1)
  }
  seg = seg.trim()

  // 敬称が付いていれば、その手前までが氏名（例: 山岸さん2回目面談 → 山岸）
  const hon = seg.search(/(様|さん|氏|くん|君|ちゃん)/)
  if (hon > 0) {
    seg = seg.slice(0, hon)
  } else {
    // 敬称が無い場合は用件語を除去（例: 金子萌々 面談 → 金子萌々）
    seg = seg.replace(TOPIC_WORDS, ' ')
  }

  // 記号を空白に。氏名の中の空白（例: 山口 結衣）は残す。
  seg = seg
    .replace(/[_\-–—|｜・､、,。.／/:：*＊+＋~〜#＃"'`]+/g, ' ')
    .replace(/[　\s]+/g, ' ')
    .trim()

  // 数字だけ／英数字だけのトークンは氏名ではないので落とす
  seg = seg
    .split(' ')
    .filter((t) => t && !/^[0-9a-zA-Z]+$/.test(t))
    .join(' ')
    .trim()

  return seg
}

/* ------------------------------------------------------------------ *
 * Nottaドキュメントから要約セクションを取り出す
 *
 * Nottaが書き出すGoogleドキュメントは、おおむね次の構成です。
 *
 *   （タイトル・日時など）
 *   AI要約（または 要約／サマリー）
 *     …要約本文（テンプレートにより 概要／アクションアイテム 等の小見出しを含む）…
 *   チャプター
 *     00:00 挨拶 …
 *   文字起こし
 *     発言者 1 00:00
 *     …
 *
 * 対応履歴には文字起こしではなく、この要約セクションをそのまま記録します。
 * ------------------------------------------------------------------ */

/** 要約セクションの見出し */
const SUMMARY_HEADING = /^(AI\s*要約|要約|サマリー|概要|Summary)\s*[:：]?\s*$/i

/** 要約の終わり（＝文字起こし・チャプターの始まり）を示す見出し */
const TRANSCRIPT_HEADING =
  /^(チャプター|文字起こし(記録)?|トランスクリプト|会話記録|全文(文字起こし)?|Chapters?|Transcript(ion)?)\s*[:：]?\s*$/i

/** 「発言者 1 00:00」「00:00 挨拶」のようなタイムスタンプ行 */
function isTimestampLine(line: string): boolean {
  const s = line.trim()
  return (
    /^\d{1,2}:\d{2}(:\d{2})?(\s|$)/.test(s) ||
    /^.{1,40}\s\d{1,2}:\d{2}(:\d{2})?$/.test(s)
  )
}

/**
 * ドキュメント本文から、記載されている要約セクションをそのまま抜き出す。
 * 要約が見つからない（文字起こしのみのドキュメント）場合は '' を返す。
 */
export function extractDocSummary(docText: string): string {
  const lines = docText.split(/\r?\n/)
  const start = lines.findIndex((l) => SUMMARY_HEADING.test(l.trim()))
  if (start === -1) return ''

  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    if (TRANSCRIPT_HEADING.test(t)) break
    if (t && isTimestampLine(line)) break
    body.push(line)
  }

  const summary = body.join('\n').trim()
  // 見出しだけで中身が無いケースは「要約なし」として扱う
  return summary.length >= 20 ? summary : ''
}

/* ------------------------------------------------------------------ *
 * 顧客照合
 * ------------------------------------------------------------------ */

export type CustomerLite = { id: string; name: string; ca: string | null }
type IndexedCustomer = CustomerLite & {
  email: string | null
  phone: string | null
  norm: string
}

/** 空白・記号を取り除いた比較用の文字列 */
function normName(s: string): string {
  return (s || '')
    .replace(/[　\s]+/g, '')
    .replace(/[・･.,、。‐\-−ー―–—]/g, '')
    .toLowerCase()
}

function normPhone(s: string): string {
  return (s || '').replace(/[^0-9]/g, '')
}

/** 顧客一覧を1回だけ読み込み、照合用のインデックスを作る */
export async function loadCustomerIndex(): Promise<IndexedCustomer[]> {
  const rows = await prisma.customer.findMany({
    select: { id: true, name: true, ca: true, email: true, phone: true },
  })
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    ca: r.ca ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    norm: normName(r.name),
  }))
}

export type MatchResult = {
  customer: CustomerLite | null
  /** 照合に使った手がかり */
  by: 'email' | 'phone' | 'name' | 'name-prefix' | 'none'
  /** 使用した氏名候補 */
  name: string
  /** 未照合・あいまいなときの理由 */
  note?: string
}

/**
 * 抽出結果とファイル名から既存のCustomerを照合する。
 * 優先順位は メール > 電話 > 氏名（完全一致）> 氏名（姓のみの前方一致）。
 *
 * 姓のみの前方一致は、候補が1人に絞れたときだけ採用します。
 * 同姓が複数いる場合は誤登録を避けるため未照合として報告します。
 */
export async function matchCustomerDetailed(
  ex: Extracted,
  fileName: string,
  index?: IndexedCustomer[]
): Promise<MatchResult> {
  const list = index ?? (await loadCustomerIndex())

  const email = (ex.email || '').trim().toLowerCase()
  const phone = normPhone(ex.phone || '')

  // ファイル名から取れた氏名を最優先。取れなければLLMが本文から拾った氏名。
  const fromFile = guessNameFromFileName(fileName)
  const fromBody = (ex.personName || '').trim()
  const name = fromFile || fromBody
  const pick = (c: IndexedCustomer): CustomerLite => ({ id: c.id, name: c.name, ca: c.ca })

  if (email) {
    const hit = list.find((c) => (c.email || '').trim().toLowerCase() === email)
    if (hit) return { customer: pick(hit), by: 'email', name }
  }

  if (phone.length >= 9) {
    const hit = list.find((c) => {
      const p = normPhone(c.phone || '')
      return p.length >= 9 && p === phone
    })
    if (hit) return { customer: pick(hit), by: 'phone', name }
  }

  for (const cand of [name, fromBody].filter(Boolean)) {
    const n = normName(cand)
    if (n.length < 2) continue

    const exact = list.filter((c) => c.norm === n)
    if (exact.length === 1) return { customer: pick(exact[0]), by: 'name', name: cand }
    if (exact.length > 1) {
      return { customer: null, by: 'none', name: cand, note: `同名の顧客が${exact.length}件あります` }
    }

    // 姓だけ拾えたケース（例: 山岸 → 山岸太郎）
    const partial = list.filter(
      (c) => c.norm.length >= 2 && (c.norm.startsWith(n) || n.startsWith(c.norm))
    )
    if (partial.length === 1) return { customer: pick(partial[0]), by: 'name-prefix', name: cand }
    if (partial.length > 1) {
      return {
        customer: null,
        by: 'none',
        name: cand,
        note: `候補が${partial.length}件（${partial.slice(0, 5).map((c) => c.name).join('・')}）。姓だけでは特定できません`,
      }
    }
  }

  return {
    customer: null,
    by: 'none',
    name,
    note: name ? 'CRMに該当の顧客が見つかりません' : 'ファイル名から氏名を取得できません',
  }
}

/** 後方互換：Customer か null を返す簡易版 */
export async function matchCustomer(ex: Extracted, fileName: string, index?: IndexedCustomer[]) {
  const r = await matchCustomerDetailed(ex, fileName, index)
  return r.customer
}

/* ------------------------------------------------------------------ *
 * 議事録生成
 * ------------------------------------------------------------------ */

function extractJson(text: string): any {
  // ```json ... ``` やそのまま {...} を許容
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('LLM応答からJSONを抽出できませんでした')
  return JSON.parse(raw.slice(start, end + 1))
}

/**
 * 面談の本文（文字起こし、またはドキュメント記載の要約）から
 * 議事録と氏名・連絡先を生成。
 * ANTHROPIC_API_KEY が無い場合は、素の本文を整形したフォールバックを返す。
 */
export async function generateMinutes(
  fileName: string,
  body: string,
  sourceKind: '文字起こし' | '要約' = '文字起こし'
): Promise<Extracted> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const text = body.slice(0, 40000) // 長すぎる場合は先頭を使用

  if (!apiKey) {
    return {
      personName: guessNameFromFileName(fileName),
      minutes: `## 面談メモ（自動整形なし）\n\n> ANTHROPIC_API_KEY 未設定のため、${sourceKind}をそのまま記録しています。\n\n**ファイル**: ${fileName}\n\n${text}`,
    }
  }

  const system = [
    'あなたは人材紹介会社（キャリアアドバイザー）向けの議事録作成アシスタントです。',
    `面談の${sourceKind}から、簡潔で実務に使える議事録を作成します。`,
    '出力は必ず指定のJSONのみ。前後の説明文やコードフェンスは付けないでください。',
  ].join('\n')

  const userPrompt = [
    `以下はキャリア面談の${sourceKind}です。ファイル名: ${fileName}`,
    '',
    `--- ${sourceKind}ここから ---`,
    text,
    `--- ${sourceKind}ここまで ---`,
    '',
    '注意: 面談にはキャリアアドバイザー（自社の担当者）と求職者が参加しています。',
    'personName には「求職者（お客様）」の氏名を入れてください。アドバイザー側の氏名ではありません。',
    'ファイル名は「アドバイザー名 面談: 求職者名様」または「アドバイザー名/求職者名さん用件」の形式です。',
    '',
    '次のJSON形式で出力してください（値が不明な項目は空文字 "" にする）:',
    '{',
    '  "personName": "面談対象者（求職者）の氏名",',
    '  "kana": "ふりがな",',
    '  "email": "メールアドレス（文中にあれば）",',
    '  "phone": "電話番号（文中にあれば）",',
    '  "minutes": "議事録本文。markdownで ## 要約 / ## 決定事項 / ## ToDo / ## 懸念・特記 の見出しを付ける",',
    '  "result": "面談結果の1〜2文サマリ",',
    '  "nextAction": "次回アクション（無ければ空）",',
    '  "nextDeadline": "次回期日 YYYY-MM-DD（無ければ空）"',
    '}',
  ].join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2500,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  const out = (data?.content?.[0]?.text || '').trim()
  const json = extractJson(out)

  return {
    personName: String(json.personName || '').trim() || guessNameFromFileName(fileName),
    kana: json.kana || '',
    email: json.email || '',
    phone: json.phone || '',
    minutes: String(json.minutes || '').trim() || `## 面談メモ\n\n${text.slice(0, 4000)}`,
    result: json.result || '',
    nextAction: json.nextAction || '',
    nextDeadline: (json.nextDeadline || '').trim(),
  }
}
