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

/** ファイル名から日付・定型語を除いて氏名候補を推定 */
export function guessNameFromFileName(fileName: string): string {
  const s = fileName
    .replace(/\.[a-zA-Z0-9]+$/, '')                 // 拡張子
    .replace(/\d{4}[-/年.]?\d{1,2}[-/月.]?\d{1,2}日?/g, ' ') // 日付
    .replace(/\d{1,2}[:：]\d{2}/g, ' ')             // 時刻
    .replace(/(面談|議事録|初回|二次|フォロー|MTG|ミーティング|商談|Notta|録音|文字起こし|さん|様)/gi, ' ')
    .replace(/[_\-|｜・／/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // 残った最初のトークンを氏名候補とする
  return s.split(' ')[0] || s
}

function extractJson(text: string): Record<string, unknown> {
  // ```json ... ``` やそのまま {...} を許容
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('LLM応答からJSONを抽出できませんでした')
  return JSON.parse(raw.slice(start, end + 1))
}

/**
 * 文字起こしから議事録と氏名・連絡先を生成。
 * ANTHROPIC_API_KEY が無い場合は、素の本文を整形したフォールバックを返す。
 */
export async function generateMinutes(fileName: string, transcript: string): Promise<Extracted> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const text = transcript.slice(0, 40000) // 長すぎる場合は先頭を使用

  if (!apiKey) {
    return {
      personName: guessNameFromFileName(fileName),
      minutes: `## 面談メモ（自動整形なし）\n\n> ANTHROPIC_API_KEY 未設定のため、文字起こしをそのまま記録しています。\n\n**ファイル**: ${fileName}\n\n${text}`,
    }
  }

  const system = [
    'あなたは人材紹介会社（キャリアアドバイザー）向けの議事録作成アシスタントです。',
    '面談の文字起こしから、簡潔で実務に使える議事録を作成します。',
    '出力は必ず指定のJSONのみ。前後の説明文やコードフェンスは付けないでください。',
  ].join('\n')

  const userPrompt = [
    `以下はキャリア面談の文字起こしです。ファイル名: ${fileName}`,
    '',
    '--- 文字起こしここから ---',
    text,
    '--- 文字起こしここまで ---',
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
    kana: String(json.kana || ''),
    email: String(json.email || ''),
    phone: String(json.phone || ''),
    minutes: String(json.minutes || '').trim() || `## 面談メモ\n\n${text.slice(0, 4000)}`,
    result: String(json.result || ''),
    nextAction: String(json.nextAction || ''),
    nextDeadline: String(json.nextDeadline || '').trim(),
  }
}

/** 抽出結果とファイル名から、既存のCustomerを照合（email > phone > 氏名の順） */
export async function matchCustomer(ex: Extracted, fileName: string) {
  const email = (ex.email || '').trim().toLowerCase()
  const phone = (ex.phone || '').trim()
  const name = (ex.personName || '').trim() || guessNameFromFileName(fileName)
  if (!email && !phone && !name) return null

  const conditions = [
    email ? { email } : null,
    phone ? { phone } : null,
    name ? { name } : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  return prisma.customer.findFirst({
    where: { OR: conditions },
    select: { id: true, name: true, ca: true },
  })
}
