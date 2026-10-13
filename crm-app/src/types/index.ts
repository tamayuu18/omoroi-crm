import type { Customer as PrismaCustomer, Task, Meeting, History as PrismaHistory, Yomi, Job, JobProposal, ProposalNote } from '@prisma/client'

export type { Task, Meeting, Yomi, Job, JobProposal, ProposalNote }

// 提案一覧に結合する求人情報（求人票本文 detail などの重いカラムは含めない）
export type ProposalJob = Pick<Job, 'id' | 'company' | 'title' | 'area' | 'salary' | 'sourceUrl' | 'status'>

// 提案に紐づく求人情報・社内メモを含めた表示用の型
export type JobProposalWithJob = JobProposal & { job: ProposalJob; proposalNotes: ProposalNote[] }

// 求人一覧・選択肢用（求人票本文 detail / 社内メモ note を除いたもの）
export type JobSummary = Omit<Job, 'detail' | 'note'>

// ダッシュボード（/api/dashboard）。件数はすべてDB側で集計済み
export type DashboardYomiCustomer = Pick<
  PrismaCustomer,
  'id' | 'name' | 'ca' | 'status' | 'expectedCloseMonth' | 'yomiRank' | 'expectedRevenue' | 'feeRate' | 'fixedFee'
>
export type DashboardStats = {
  totalCustomers: number
  unreachable: number
  weekMeetings: number
  overdueTasks: number
  statusCounts: { status: string; count: number }[]
  caCounts: { ca: string; count: number }[]
  recentCancelled: { id: string; date: Date | null; customerId: string; ca: string | null; customerName: string }[]
  yomiCustomers: DashboardYomiCustomer[]
  // 初回面談から5営業日以上たっても書類提出（応募）がない求職者
  docSubmitAlerts: DocSubmitAlert[]
}

export type DocSubmitAlert = {
  id: string
  name: string
  ca: string | null
  status: string
  firstMeetingAt: Date
  businessDays: number   // 初回面談からの経過営業日数
}

// CA別KPI集計の1行。人数ベース（同一求職者は各段階で1人として数える）と
// 件数ベース（応募社数＝求人提案ごとに1件）の指標が混在するので、コメントの単位に注意。
export type KpiRow = {
  ca: string
  meetingsSet: number      // 面談設定数（人）
  firstMeetings: number    // 初回面談数（人）
  proposals: number        // 求人提案数（人）
  selections: number       // 選考数（人）
  applications: number     // 応募件数（件：応募社数ベース）
  interviews: number       // 面接数（人）
  firstInterviews: number  // 一次面接実施件数（件：応募社数ベース）
  firstInterviewCustomers: number // 一次面接を実施した人数（人：一次面接実施率の分子）
  offers: number           // 内定数（人）
  accepted: number         // 内定承諾数（人）
}

// 候補者ごとのリードタイム（KPIページの候補者別一覧）。対象月に初回面談をした求職者が対象
export type KpiLeadTimeRow = {
  customerId: string
  name: string
  ca: string
  status: string
  firstMeetingAt: Date | null
  meetingHeld: boolean          // 初回面談が実施済みか（未実施なら日数は出さない）
  appliedAt: Date | null        // 最初の応募日（書類提出日）
  docBusinessDays: number | null // 初回面談→書類提出の営業日数（未提出なら経過営業日数）
  docPending: boolean           // 書類未提出
  docAlert: boolean             // 5営業日以上
  firstInterviewAt: Date | null // 最初に実施した一次面接日
  interviewDays: number | null  // 初回面談→一次面接実施の暦日数
}

export type Customer = PrismaCustomer & {
  expectedRevenue?: string | null
  feeRate?: string | null
  fixedFee?: string | null
  birthDate?: string | null
  education?: string | null
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
