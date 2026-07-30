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
