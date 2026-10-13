// 初回面談からのリードタイム（書類提出・一次面接）を計算する共通ロジック。
// サーバー（KPI集計・ダッシュボード）とブラウザ（顧客詳細）の両方から使うため、
// Prisma など Node 専用のモジュールには依存しない。
//
// 日付はDBにUTCで保存されているので、「何日経ったか」は日本時間の暦日に揃えてから数える。

import { DOC_SUBMIT_ALERT_BUSINESS_DAYS, PROPOSAL_CLOSED_STATUSES } from './constants'

const DAY_MS = 24 * 60 * 60 * 1000
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

type DateLike = Date | string | null | undefined

function toDate(d: DateLike): Date | null {
  if (!d) return null
  const date = typeof d === 'string' ? new Date(d) : d
  return Number.isNaN(date.getTime()) ? null : date
}

/** 日本時間での暦日キー（'YYYY-MM-DD'） */
export function toJstDateKey(d: DateLike): string | null {
  const date = toDate(d)
  if (!date) return null
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

// 1970-01-01 からの日数（暦日キー同士の差を取るため）
function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

// 1970-01-01 は木曜日。0=日曜 … 6=土曜
function dayOfWeek(index: number): number {
  return (((index + 4) % 7) + 7) % 7
}

// 土日以外を営業日とみなす。祝日を除外したい場合はここに 'YYYY-MM-DD' を追加する。
const NON_BUSINESS_DAYS = new Set<string>([])

function isBusinessDay(index: number): boolean {
  const dow = dayOfWeek(index)
  if (dow === 0 || dow === 6) return false
  if (NON_BUSINESS_DAYS.size > 0) {
    const key = new Date(index * DAY_MS).toISOString().slice(0, 10)
    if (NON_BUSINESS_DAYS.has(key)) return false
  }
  return true
}

/**
 * from の翌日から to までに含まれる営業日の数（日本時間の暦日基準）。
 * 例: 月曜 → 翌週月曜 = 5営業日。to が from 以前なら 0。
 */
export function businessDaysBetween(from: DateLike, to: DateLike): number | null {
  const a = toJstDateKey(from)
  const b = toJstDateKey(to)
  if (!a || !b) return null
  const ai = dayIndex(a)
  const bi = dayIndex(b)
  if (bi <= ai) return 0
  let count = 0
  for (let i = ai + 1; i <= bi; i++) if (isBusinessDay(i)) count++
  return count
}

/** from から to までの暦日数（日本時間の暦日基準）。to が from 以前なら 0 */
export function calendarDaysBetween(from: DateLike, to: DateLike): number | null {
  const a = toJstDateKey(from)
  const b = toJstDateKey(to)
  if (!a || !b) return null
  return Math.max(0, dayIndex(b) - dayIndex(a))
}

/** 日本時間で「今日」の終わり（翌日0:00 JST）をUTCの Date で返す。SQLの「当日以前」判定に使う */
export function jstDayEndUtc(now: Date = new Date()): Date {
  const key = toJstDateKey(now)!
  return new Date(new Date(`${key}T00:00:00Z`).getTime() - JST_OFFSET_MS + DAY_MS)
}

/**
 * 提案の一次面接が「実施済み」かどうか。
 *  - 一次面接日が入力されていて、その日が今日（日本時間）以前
 *  - ただし辞退・見送りで、面接日より前に決着している場合は未実施とみなす
 * （db.ts の KPI 集計SQLにも同じ条件があるので、変更時は両方を合わせること）
 */
export function isFirstInterviewHeld(
  p: { interviewDate: DateLike; status: string; decidedAt: DateLike },
  now: Date = new Date(),
): boolean {
  const interviewKey = toJstDateKey(p.interviewDate)
  if (!interviewKey) return false
  if (interviewKey > toJstDateKey(now)!) return false
  if (PROPOSAL_CLOSED_STATUSES.includes(p.status)) {
    const decidedKey = toJstDateKey(p.decidedAt)
    if (decidedKey && decidedKey < interviewKey) return false
  }
  return true
}

export type LeadTime = {
  firstMeetingAt: Date | null
  /** 最初の応募日（書類提出日）。未提出なら null */
  appliedAt: Date | null
  /** 初回面談から書類提出までの営業日数。未提出なら今日までの経過営業日数 */
  docBusinessDays: number | null
  /** 書類未提出（docBusinessDays は経過日数） */
  docPending: boolean
  /** 5営業日以上かかっている／経過している */
  docAlert: boolean
  /** 最初に実施した一次面接日 */
  firstInterviewAt: Date | null
  /** 初回面談から一次面接実施までの暦日数 */
  interviewDays: number | null
}

/**
 * 初回面談日・応募日・一次面接日からリードタイムを組み立てる。
 * trackPending: 未提出のときに経過営業日数とアラートを出すか（初回面談済みで応募前の顧客だけ true）
 */
export function buildLeadTime(input: {
  firstMeetingAt: DateLike
  appliedAt: DateLike
  firstInterviewAt: DateLike
  trackPending: boolean
  now?: Date
}): LeadTime {
  const now = input.now ?? new Date()
  const firstMeetingAt = toDate(input.firstMeetingAt)
  const appliedAt = toDate(input.appliedAt)
  const firstInterviewAt = toDate(input.firstInterviewAt)

  let docBusinessDays: number | null = null
  let docPending = false
  if (firstMeetingAt && appliedAt) {
    docBusinessDays = businessDaysBetween(firstMeetingAt, appliedAt)
  } else if (firstMeetingAt && input.trackPending) {
    docBusinessDays = businessDaysBetween(firstMeetingAt, now)
    docPending = true
  }
  const docAlert = docBusinessDays !== null && docBusinessDays >= DOC_SUBMIT_ALERT_BUSINESS_DAYS

  const interviewDays = firstMeetingAt && firstInterviewAt
    ? calendarDaysBetween(firstMeetingAt, firstInterviewAt)
    : null

  return { firstMeetingAt, appliedAt, docBusinessDays, docPending, docAlert, firstInterviewAt, interviewDays }
}
