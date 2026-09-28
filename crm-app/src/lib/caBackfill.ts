import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { normalizeCa } from './ca'

/**
 * 担当CA名の表記ゆれを正式名へ統一する（既存データのバックフィル）。
 * 例: 「岩田珠優（社用）」で登録された顧客・面談・タスク・履歴・提案を「岩田珠優」に統一し、
 *     顧客一覧の絞り込みやKPI・ダッシュボードで同一人物として扱えるようにする。
 *
 * 対象カラム: Customer.ca / Meeting.ca / Task.ca / Task.assignee / History.ca / History.createdBy /
 *             Yomi.ca / JobProposal.ca / ProposalNote.createdBy
 */

// 表記ゆれを吸収する対象のテーブル・カラム
const TARGETS: { table: string; column: string }[] = [
  { table: 'Customer', column: 'ca' },
  { table: 'Meeting', column: 'ca' },
  { table: 'Task', column: 'ca' },
  { table: 'Task', column: 'assignee' },
  { table: 'History', column: 'ca' },
  { table: 'History', column: 'createdBy' },
  { table: 'Yomi', column: 'ca' },
  { table: 'JobProposal', column: 'ca' },
  { table: 'ProposalNote', column: 'createdBy' },
]

export type CaChange = { table: string; column: string; from: string; to: string; count: number; updated?: number }

export type CaBackfillResult = {
  mode: 'apply' | 'report'
  targets: number
  rows: number
  updated: number
  changes: CaChange[]
  errors: { table: string; column: string; error: string }[]
}

/**
 * apply=false: 対象（表記 → 正式名 と件数）を返すだけでDBには書き込まない。
 * apply=true : 実際に更新する。何度実行しても結果は同じ（冪等）。
 */
export async function normalizeCaRecords(apply: boolean): Promise<CaBackfillResult> {
  const changes: CaChange[] = []
  const errors: CaBackfillResult['errors'] = []

  for (const { table, column } of TARGETS) {
    const tableSql = Prisma.raw(`"${table}"`)
    const columnSql = Prisma.raw(`"${column}"`)
    try {
      // テーブルに存在する表記を洗い出し、正規化すると変わるものだけを対象にする
      const rows = await prisma.$queryRaw<{ value: string; count: number }[]>`
        SELECT ${columnSql} AS "value", COUNT(*)::int AS "count"
        FROM ${tableSql}
        WHERE ${columnSql} IS NOT NULL AND ${columnSql} <> ''
        GROUP BY 1
      `
      for (const r of rows) {
        const to = normalizeCa(r.value)
        if (!to || to === r.value) continue
        const change: CaChange = { table, column, from: r.value, to, count: r.count }
        if (apply) {
          change.updated = await prisma.$executeRaw`
            UPDATE ${tableSql} SET ${columnSql} = ${to} WHERE ${columnSql} = ${r.value}
          `
        }
        changes.push(change)
      }
    } catch (e) {
      // テーブル未作成（例: JobProposal を使っていない環境）などは飛ばして続行する
      errors.push({ table, column, error: String(e) })
    }
  }

  return {
    mode: apply ? 'apply' : 'report',
    targets: changes.length,
    rows: changes.reduce((n, c) => n + c.count, 0),
    updated: apply ? changes.reduce((n, c) => n + (c.updated ?? 0), 0) : 0,
    changes,
    errors,
  }
}
