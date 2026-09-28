import { CA_OPTIONS } from './constants'

/**
 * CA名の表記ゆれを正式名に寄せるためのエイリアス表。
 * 例: TimeRexの社用アカウントやGoogleログイン名が「岩田珠優（社用）」で入ってくるが、
 *     CRM上は「岩田珠優」と同一人物として扱う。
 */
export const CA_ALIASES: Record<string, string> = {
  '岩田珠優（社用）': '岩田珠優',
  '岩田珠優(社用)': '岩田珠優',
}

// 「（社用）」「(社用)」「【社用】」などアカウント種別を表す接尾辞
const ACCOUNT_SUFFIX = /[\s　]*[（(【\[]\s*社用\s*[）)】\]]$/

/**
 * CA名を正規化する。
 *  - 前後の空白を除去
 *  - エイリアス表にあればその正式名へ
 *  - 「（社用）」などの接尾辞を取り除いた結果が既知のCA名なら、その名前へ
 * それ以外はそのまま返す（空文字・null・undefined はそのまま）。
 */
export function normalizeCa<T extends string | null | undefined>(name: T): T
export function normalizeCa(name: string | null | undefined): string | null | undefined {
  if (name == null) return name
  const trimmed = name.trim()
  if (!trimmed) return name
  if (CA_ALIASES[trimmed]) return CA_ALIASES[trimmed]
  const stripped = trimmed.replace(ACCOUNT_SUFFIX, '')
  if (stripped !== trimmed && CA_OPTIONS.includes(stripped)) return stripped
  return trimmed
}

/**
 * 正式名に対して、DBに残っている可能性のある表記（正式名＋エイリアス）をすべて返す。
 * 既存データを書き換える前でも、絞り込みが両方の表記に当たるようにするために使う。
 */
export function caVariants(ca: string): string[] {
  const canonical = normalizeCa(ca)
  const variants = new Set<string>([ca, canonical])
  for (const [alias, target] of Object.entries(CA_ALIASES)) {
    if (target === canonical) variants.add(alias)
  }
  return [...variants]
}

/** Prisma の where 条件: 正式名とエイリアスのどちらにも一致させる */
export function caWhere(ca: string): string | { in: string[] } {
  const variants = caVariants(ca)
  return variants.length === 1 ? variants[0] : { in: variants }
}
