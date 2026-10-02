import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 「1995年4月1日」「1995/4/1」「1995-04-01」などの生年月日文字列を YYYY-MM-DD に正規化する
export function normalizeBirthDate(value: string | null | undefined): string {
  if (!value) return ''
  const m = String(value).match(/(\d{4})[年\/\-.](\d{1,2})[月\/\-.](\d{1,2})/)
  if (!m) return ''
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

// 生年月日から満年齢を算出する。解釈できない場合や非現実的な値は空文字を返す
export function calcAge(birthDate: string | null | undefined): string {
  const normalized = normalizeBirthDate(birthDate)
  if (!normalized) return ''
  const [y, m, d] = normalized.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - y
  const monthDiff = today.getMonth() + 1 - m
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--
  return age >= 0 && age <= 130 ? String(age) : ''
}

// Postgres の TEXT 型は NUL 文字（\u0000）を保存できない（SQLSTATE 22021: invalid byte sequence for encoding "UTF8": 0x00）。
// 求人票の自動取込などで外部サイト由来のテキストに混入することがあるため、保存前に取り除く。
export function stripNullChars(s: string): string {
  return s.replace(/\u0000/g, '')
}

// オブジェクト・配列を再帰的にたどり、含まれる文字列すべてから NUL 文字を取り除く（Date 等はそのまま返す）
export function stripNullCharsDeep<T>(value: T): T {
  if (typeof value === 'string') return stripNullChars(value) as T
  if (Array.isArray(value)) return value.map(v => stripNullCharsDeep(v)) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripNullCharsDeep(v)])
    ) as T
  }
  return value
}
