import type { Customer as PrismaCustomer, Task, Meeting, History as PrismaHistory, Yomi } from '@prisma/client'

export type { Task, Meeting, Yomi }

export type Customer = PrismaCustomer & {
  expectedRevenue?: string | null
  feeRate?: string | null
  meetings?: Pick<Meeting, 'date'>[]
  tasks?: Pick<Task, 'id'>[]
}

export type History = PrismaHistory & {
  createdBy?: string | null
}

export type CustomerStatus =
  | '新規送客'
  | '初回未対応'
  | '初回連絡済み'
  | '不通'
  | '面談予約済み'
  | '面談実施済み'
  | '面談キャンセル'
  | 'リスケ調整中'
  | '求人提案中'
  | '応募意思確認中'
  | '応募済み'
  | '書類選考中'
  | '一次面接予定'
  | '一次面接結果待ち'
  | '最終面接予定'
  | '最終面接結果待ち'
  | '内定'
  | '承諾'
  | '入社予定'
  | '入社済み'
  | '辞退'
  | '失注'
  | '長期フォロー'

export const ALL_STATUSES: CustomerStatus[] = [
  '新規送客',
  '初回未対応',
  '初回連絡済み',
  '不通',
  '面談予約済み',
  '面談実施済み',
  '面談キャンセル',
  'リスケ調整中',
  '求人提案中',
  '応募意思確認中',
  '応募済み',
  '書類選考中',
  '一次面接予定',
  '一次面接結果待ち',
  '最終面接予定',
  '最終面接結果待ち',
  '内定',
  '承諾',
  '入社予定',
  '入社済み',
  '辞退',
  '失注',
  '長期フォロー',
]
