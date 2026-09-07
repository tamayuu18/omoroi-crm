import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import type { Customer, Task, Meeting, History, Job, JobProposal, ProposalNote } from '@prisma/client'
import {
  CA_OPTIONS,
  PROPOSAL_SELECTION_STATUSES,
  PROPOSAL_INTERVIEW_STATUSES,
  PROPOSAL_OFFER_STATUSES,
  PROPOSAL_ACCEPTED_STATUSES,
} from './constants'
import type { KpiRow, DashboardStats } from '@/types'

export type { Customer, Task, Meeting, History, Job, JobProposal, ProposalNote }

// ---------------------------------------------------------------------------
// 転送量（Supabase egress）対策のメモ
//
// DB自体は数十MBしかないのに月の転送量が数GBに達していた原因は、
//   1. 顧客一覧・ダッシュボードが Customer の全カラム（base64の証明写真 photoUrl、
//      推薦文 recommendation、備考 note を含む）を毎回返していた
//   2. ダッシュボードが集計のために顧客・タスク・面談を全件取得していた
//   3. 顧客詳細が include で履歴・面談・タスクを返し、さらに画面側でも同じものを
//      個別APIで取得していた（議事録本文が毎回2重に流れていた）
//   4. 求人提案が求人票の本文 detail ごと返していた
// この層では「画面が使うカラムだけを select する」「集計はDBで済ませる」を徹底する。
// ---------------------------------------------------------------------------

// 顧客一覧（/customers）で使うカラムだけ。写真・推薦文・備考などの重いテキストは返さない。
const CUSTOMER_LIST_SELECT = {
  id: true,
  name: true,
  kana: true,
  ca: true,
  status: true,
  yomiRank: true,
  nextAction: true,
  nextDeadline: true,
  registeredAt: true,
  updatedAt: true,
  meetings: { where: { status: { not: 'キャンセル' } }, orderBy: { date: 'asc' as const }, take: 1, select: { date: true } },
  tasks: { where: { status: { not: '完了' } }, select: { id: true }, take: 1 },
} satisfies Prisma.CustomerSelect

export type CustomerListRow = Prisma.CustomerGetPayload<{ select: typeof CUSTOMER_LIST_SELECT }>

function buildCustomerWhere(filters?: { status?: string | string[]; ca?: string; yomiRank?: string; search?: string }) {
  const where: Prisma.CustomerWhereInput = {}
  if (filters?.status) {
    const statuses = (Array.isArray(filters.status) ? filters.status : [filters.status]).filter(Boolean)
    if (statuses.length === 1) where.status = statuses[0]
    else if (statuses.length > 1) where.status = { in: statuses }
  }
  if (filters?.ca) where.ca = filters.ca
  if (filters?.yomiRank) where.yomiRank = filters.yomiRank
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { phone: { contains: filters.search } },
      { email: { contains: filters.search } },
    ]
  }
  return where
}

export async function getCustomers(filters?: { status?: string | string[]; ca?: string; yomiRank?: string; search?: string; sortBy?: string; sortDir?: string; page?: number; pageSize?: number }): Promise<{ customers: CustomerListRow[]; total: number }> {
  const where = buildCustomerWhere(filters)
  const dir = filters?.sortDir === 'asc' ? 'asc' : 'desc'
  // Prisma does not support ordering findMany by a related model's _min/_max
  // aggregate, so 初回面談日 (firstMeeting) is sorted in memory below.
  const validSorts: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
    name: { name: dir },
    registeredAt: { registeredAt: dir },
    updatedAt: { updatedAt: dir },
    nextDeadline: { nextDeadline: dir },
    status: { status: dir },
  }
  const orderBy = validSorts[filters?.sortBy ?? ''] ?? { updatedAt: 'desc' }

  const page = filters?.page
  const pageSize = filters?.pageSize ?? 30

  // 初回面談日ソートはDBで並べ替えできない。以前は全顧客の全カラムを取得して
  // メモリ上でソートしていたが、ここでは「id と初回面談日」だけを取得して
  // 並び順を決め、表示ページ分の行だけを改めて取得する。
  if (filters?.sortBy === 'firstMeeting') {
    const keys = await prisma.customer.findMany({
      where,
      orderBy,
      select: { id: true, meetings: CUSTOMER_LIST_SELECT.meetings },
    })
    const factor = dir === 'asc' ? 1 : -1
    keys.sort((a, b) => {
      const aDate = a.meetings[0]?.date
      const bDate = b.meetings[0]?.date
      // Customers without a meeting date sort to the end regardless of direction.
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      return (aDate.getTime() - bDate.getTime()) * factor
    })
    const total = keys.length
    const pageKeys = page ? keys.slice((page - 1) * pageSize, page * pageSize) : keys
    const ids = pageKeys.map((k) => k.id)
    if (ids.length === 0) return { customers: [], total }
    const rows = await prisma.customer.findMany({ where: { id: { in: ids } }, select: CUSTOMER_LIST_SELECT })
    const byId = new Map(rows.map((r) => [r.id, r]))
    const customers = ids.map((id) => byId.get(id)).filter((c): c is CustomerListRow => !!c)
    return { customers, total }
  }

  if (page) {
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, orderBy, select: CUSTOMER_LIST_SELECT, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return { customers, total }
  }

  const customers = await prisma.customer.findMany({ where, orderBy, select: CUSTOMER_LIST_SELECT })
  return { customers, total: customers.length }
}

// 顧客詳細。タスク・面談・履歴・提案は画面側が個別APIで取得するため、ここでは含めない
// （以前は include していたため、議事録本文などが同じ画面で2重に転送されていた）。
// 証明写真（base64 の photoUrl、最大2MB）も含めず、有無だけを返す。画像本体は
// /api/customers/[id]/photo からブラウザキャッシュ付きで配信する（getCustomerPhoto）。
// 詳細画面は更新のたびに顧客情報を取り直すので、写真を同梱すると毎回転送されてしまう。
export async function getCustomerById(id: string) {
  const [customer, withPhoto] = await Promise.all([
    prisma.customer.findUnique({ where: { id }, omit: { photoUrl: true } }),
    prisma.customer.count({ where: { id, photoUrl: { not: null }, NOT: { photoUrl: '' } } }),
  ])
  if (!customer) return null
  return { ...customer, hasPhoto: withPhoto > 0 }
}

export async function getCustomerPhoto(id: string) {
  const row = await prisma.customer.findUnique({ where: { id }, select: { photoUrl: true, updatedAt: true } })
  return row?.photoUrl ? { photoUrl: row.photoUrl, updatedAt: row.updatedAt } : null
}

export async function createCustomer(data: Omit<Customer, 'id' | 'registeredAt' | 'updatedAt'>) {
  return prisma.customer.create({ data })
}

// 面談がまだ「実施済み」とみなせない顧客ステータス（これら以外は面談実施後のステータス）
export const PRE_INTERVIEW_STATUSES = [
  '新規送客', '初回未対応', '初回連絡済み', '不通', '面談予約済み', '面談キャンセル', 'リスケ調整中',
]

// Meeting自体が「実施済み」を表す status
const MEETING_HELD_STATUSES = ['実施', '実施済', '面談実施済み', '完了']

async function syncMeetingHeldStatus(customerId: string, status?: string | null) {
  if (!status || PRE_INTERVIEW_STATUSES.includes(status)) return
  const meeting = await prisma.meeting.findFirst({
    where: { customerId, status: { notIn: ['キャンセル', '完了'] } },
    orderBy: { date: 'desc' },
    select: { id: true },
  })
  if (meeting) {
    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: '完了' }, select: { id: true } })
  }
}

/**
 * 議事録が追加された顧客のステータスを「面談実施済み」に進める。
 * すでに面談実施後の段階（求人提案中・内定など）まで進んでいる顧客は変更しない。
 * ステータスを進めた場合は、KPI集計用に直近の面談レコードも「完了」に同期する。
 */
export async function markInterviewHeld(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { status: true },
  })
  if (!customer || !PRE_INTERVIEW_STATUSES.includes(customer.status)) return
  await prisma.customer.update({
    where: { id: customerId },
    data: { status: '面談実施済み' },
    select: { id: true },
  })
  await syncMeetingHeldStatus(customerId, '面談実施済み')
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  // 更新結果に写真（base64）を含めない。写真を更新した場合も画面側は送った画像をそのまま表示する
  const customer = await prisma.customer.update({ where: { id }, data, omit: { photoUrl: true } })

  // ステータスが面談実施後の段階に変わった際、対応する直近の面談レコードにも
  // 実施結果を反映する。KPI集計(getKpi)はMeeting.statusを見て初回面談数を数えるため、
  // Customer.statusだけ更新してもMeetingが未更新のままだとKPIに反映されない。
  if (data.status) await syncMeetingHeldStatus(id, data.status)

  return customer
}

// ========== タスク ==========
export type TaskFilters = {
  customerId?: string
  ca?: string
  assignee?: string
  // 'open' = 完了以外、'done' = 完了、それ以外は文字列一致
  status?: string
  page?: number
  pageSize?: number
}

function buildTaskWhere(filters?: TaskFilters) {
  const where: Prisma.TaskWhereInput = {}
  if (filters?.customerId) where.customerId = filters.customerId
  if (filters?.ca) where.ca = filters.ca
  if (filters?.assignee) where.assignee = filters.assignee
  if (filters?.status === 'open') where.status = { not: '完了' }
  else if (filters?.status === 'done') where.status = '完了'
  else if (filters?.status) where.status = filters.status
  return where
}

export async function getTasks(filters?: TaskFilters): Promise<{ tasks: Task[]; total: number }> {
  const where = buildTaskWhere(filters)
  // 期限未設定は末尾に置く
  const orderBy: Prisma.TaskOrderByWithRelationInput[] = [{ deadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }]
  const page = filters?.page
  const pageSize = filters?.pageSize ?? 100
  if (page) {
    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return { tasks, total }
  }
  const tasks = await prisma.task.findMany({ where, orderBy })
  return { tasks, total: tasks.length }
}

export async function updateTask(id: string, data: Partial<Task>) {
  return prisma.task.update({ where: { id }, data })
}

// ========== 面談 ==========
export async function getMeetings(filters?: { customerId?: string }) {
  const where: Prisma.MeetingWhereInput = {}
  if (filters?.customerId) where.customerId = filters.customerId
  return prisma.meeting.findMany({ where, orderBy: { date: 'desc' } })
}

export async function createMeeting(data: Omit<Meeting, 'id' | 'createdAt'>) {
  return prisma.meeting.create({ data })
}

export async function updateMeeting(id: string, data: Partial<Meeting>) {
  return prisma.meeting.update({ where: { id }, data })
}

// ========== 対応履歴 ==========
export async function getHistory(customerId: string) {
  return prisma.history.findMany({
    where: { customerId },
    orderBy: { date: 'desc' },
  })
}

export async function addHistory(data: Omit<History, 'id' | 'createdAt'>) {
  return prisma.history.create({ data })
}

// ========== 求人マスタ ==========
// 一覧・選択用。求人票本文 detail と社内メモ note は含めない（編集時に個別取得する）。
const JOB_SUMMARY_SELECT = {
  id: true,
  company: true,
  title: true,
  area: true,
  salary: true,
  employment: true,
  feeRate: true,
  status: true,
  source: true,
  sourceUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobSelect

export type JobSummary = Prisma.JobGetPayload<{ select: typeof JOB_SUMMARY_SELECT }>

export async function getJobs(filters?: { status?: string; search?: string }): Promise<JobSummary[]> {
  const where: Prisma.JobWhereInput = {}
  if (filters?.status) where.status = filters.status
  if (filters?.search) {
    where.OR = [
      { company: { contains: filters.search } },
      { title: { contains: filters.search } },
      { area: { contains: filters.search } },
    ]
  }
  return prisma.job.findMany({ where, orderBy: { updatedAt: 'desc' }, select: JOB_SUMMARY_SELECT })
}

export async function getJobById(id: string) {
  return prisma.job.findUnique({ where: { id } })
}

export async function createJob(data: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>) {
  return prisma.job.create({ data })
}

export async function updateJob(id: string, data: Partial<Job>) {
  return prisma.job.update({ where: { id }, data })
}

export async function deleteJob(id: string) {
  return prisma.job.delete({ where: { id } })
}

// ========== 求人提案（顧客 × 求人） ==========
// 提案一覧に必要な求人情報だけを結合する（求人票本文 detail は返さない）
const PROPOSAL_INCLUDE = {
  job: { select: { id: true, company: true, title: true, area: true, salary: true, sourceUrl: true, status: true } },
  proposalNotes: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.JobProposalInclude

export async function getProposals(filters?: { customerId?: string; jobId?: string }) {
  const where: Prisma.JobProposalWhereInput = {}
  if (filters?.customerId) where.customerId = filters.customerId
  if (filters?.jobId) where.jobId = filters.jobId
  return prisma.jobProposal.findMany({
    where,
    include: PROPOSAL_INCLUDE,
    orderBy: { proposedAt: 'desc' },
  })
}

export async function createProposal(data: Omit<JobProposal, 'id' | 'createdAt' | 'updatedAt' | 'proposedAt' | 'decidedAt' | 'interviewDate'> & { proposedAt?: Date }) {
  return prisma.jobProposal.create({ data, include: PROPOSAL_INCLUDE })
}

export async function updateProposal(id: string, data: Partial<JobProposal>) {
  return prisma.jobProposal.update({ where: { id }, data, include: PROPOSAL_INCLUDE })
}

export async function deleteProposal(id: string) {
  return prisma.jobProposal.delete({ where: { id } })
}

// ========== 提案ごとの社内メモ（追記専用） ==========
export async function addProposalNote(proposalId: string, data: { content: string; createdBy?: string | null }) {
  return prisma.proposalNote.create({ data: { proposalId, content: data.content, createdBy: data.createdBy ?? null } })
}

// ========== ダッシュボード集計 ==========
// 以前は顧客・タスク・面談を全件取得して画面側で数えていた。
// ここでは count / groupBy と、ヨミ表に必要な最小限のカラムだけを返す。
export async function getDashboardStats(params: {
  ca?: string
  weekStart: Date
  weekEnd: Date
  todayStart: Date
  cancelledSince: Date
}): Promise<DashboardStats> {
  const customerWhere: Prisma.CustomerWhereInput = params.ca ? { ca: params.ca } : {}

  const [byStatusCa, weekMeetings, overdueTasks, recentCancelled, yomiRows] = await Promise.all([
    prisma.customer.groupBy({
      by: ['status', 'ca'],
      where: customerWhere,
      _count: { _all: true },
    }),
    // 今週の面談数（面談はCAで絞らない：従来どおり）
    prisma.meeting.count({
      where: { date: { gte: params.weekStart, lt: params.weekEnd }, status: { not: 'キャンセル' } },
    }),
    // 期限切れタスク（今日より前の期限で未完了）
    prisma.task.count({
      where: { status: { not: '完了' }, deadline: { lt: params.todayStart } },
    }),
    // 直近7日間のキャンセル
    prisma.meeting.findMany({
      where: { status: 'キャンセル', date: { gte: params.cancelledSince } },
      select: { id: true, date: true, customerId: true, ca: true, name: true, customer: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 50,
    }),
    // 月別ヨミ表の対象顧客（受注予定月かヨミランクが設定されている顧客）
    prisma.customer.findMany({
      where: {
        ...customerWhere,
        status: { not: '失注' },
        OR: [{ expectedCloseMonth: { not: null } }, { yomiRank: { not: null } }],
      },
      select: {
        id: true, name: true, ca: true, status: true,
        expectedCloseMonth: true, yomiRank: true, expectedRevenue: true, feeRate: true, fixedFee: true,
      },
      orderBy: { expectedCloseMonth: 'asc' },
    }),
  ])

  let totalCustomers = 0
  let unreachable = 0
  const statusCounts = new Map<string, number>()
  const caCounts = new Map<string, number>()
  for (const r of byStatusCa) {
    const n = r._count._all
    totalCustomers += n
    if (r.status === '初回未対応') unreachable += n
    statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + n)
    if (r.ca) caCounts.set(r.ca, (caCounts.get(r.ca) ?? 0) + n)
  }

  return {
    totalCustomers,
    unreachable,
    weekMeetings,
    overdueTasks,
    statusCounts: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
    caCounts: Array.from(caCounts.entries())
      .map(([ca, count]) => ({ ca, count }))
      .sort((a, b) => b.count - a.count),
    recentCancelled: recentCancelled.map((m) => ({
      id: m.id,
      date: m.date,
      customerId: m.customerId,
      ca: m.ca,
      customerName: m.customer?.name || m.name || m.customerId,
    })),
    // 空文字は未設定扱い（従来の画面側の判定に合わせる）
    yomiCustomers: yomiRows.filter((c) => c.expectedCloseMonth || c.yomiRank),
  }
}

// ========== CA別KPI自動集計 ==========
// month: 'YYYY-MM'。面談設定数/初回面談数はMeetingの面談日基準で集計する。
// 求人提案数/選考数/面接数/内定数/内定承諾数は、求職者の初回面談月を基準に集計する
// （その求職者への提案・選考等が実際に発生した月ではなく、初回面談があった月の実績として計上する）。
// すべての指標は人数ベース：同一求職者に複数の面談・提案があっても各段階で1人として数える。
//
// 集計はすべてDB側（COUNT DISTINCT）で行い、アプリには CA ごとの件数だけを返す。
// 以前は対象月の面談と提案の行を取得して Node 側で数えていた上、初回面談月の判定のために
// 全期間の面談を groupBy で取得していた。
export async function getKpi(month: string): Promise<KpiRow[]> {
  // 月初〜翌月初（[start, end)）
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, m ?? 1, 1)
  // Prisma は DateTime を UTC の timestamp として保存しているので、比較値も UTC に固定する
  const startSql = Prisma.sql`(${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')`
  const endSql = Prisma.sql`(${end.toISOString()}::timestamptz AT TIME ZONE 'UTC')`

  const emptyRow = (ca: string): KpiRow =>
    ({ ca, meetingsSet: 0, firstMeetings: 0, proposals: 0, selections: 0, interviews: 0, offers: 0, accepted: 0 })

  // 先に既定CAで行を初期化しておく（クエリが失敗しても必ずCA別カードが出るように）
  const rows = new Map<string, KpiRow>()
  for (const ca of CA_OPTIONS) rows.set(ca, emptyRow(ca))
  const rowFor = (ca?: string | null) => {
    const key = ca || '未割当'
    let r = rows.get(key)
    if (!r) { r = emptyRow(key); rows.set(key, r) }
    return r
  }

  // 面談と提案は別々に集計し、片方が失敗（例: 提案テーブル未作成）しても集計を続行する
  try {
    // Meeting自体が「実施済み」を表すstatus/resultを持つか、または紐づく顧客が
    // 面談実施後の段階まで進んでいれば「面談は実施済み」とみなす（顧客側だけステータスを
    // 更新して面談レコードが未同期のケースの救済も兼ねる）
    const meetingRows = await prisma.$queryRaw<{ ca: string; meetingsSet: number; firstMeetings: number }[]>`
      SELECT
        COALESCE(NULLIF(m."ca", ''), '未割当') AS "ca",
        COUNT(DISTINCT m."customerId")::int AS "meetingsSet",
        COUNT(DISTINCT m."customerId") FILTER (
          WHERE COALESCE(m."result", '') <> ''
             OR m."status" IN (${Prisma.join(MEETING_HELD_STATUSES)})
             OR c."status" NOT IN (${Prisma.join(PRE_INTERVIEW_STATUSES)})
        )::int AS "firstMeetings"
      FROM "Meeting" m
      LEFT JOIN "Customer" c ON c."id" = m."customerId"
      WHERE m."date" >= ${startSql} AND m."date" < ${endSql}
        AND m."status" <> 'キャンセル'
      GROUP BY 1
    `
    for (const r of meetingRows) {
      const row = rowFor(r.ca)
      row.meetingsSet = r.meetingsSet
      row.firstMeetings = r.firstMeetings
    }
  } catch (e) {
    console.error('getKpi: meeting query failed', e)
  }

  try {
    // 求人提案以降(求人提案数/選考数/内定数/内定承諾数)は「発生日」ではなく
    // 「初回面談月」を基準に集計する。例: 6月に初回面談をした求職者が7月に
    // 求人提案されても、その提案は6月の実績として数える。
    // そのため、まず対象月に初回面談（最も古い非キャンセル面談）を迎えた
    // 求職者を特定し、その求職者の提案を発生時期に関わらずすべて集計する。
    const proposalRows = await prisma.$queryRaw<{ ca: string; proposals: number; selections: number; interviews: number; offers: number; accepted: number }[]>`
      WITH cohort AS (
        SELECT "customerId"
        FROM "Meeting"
        WHERE "status" <> 'キャンセル' AND "date" IS NOT NULL
        GROUP BY "customerId"
        HAVING MIN("date") >= ${startSql} AND MIN("date") < ${endSql}
      )
      SELECT
        COALESCE(NULLIF(p."ca", ''), '未割当') AS "ca",
        COUNT(DISTINCT p."customerId")::int AS "proposals",
        COUNT(DISTINCT p."customerId") FILTER (WHERE p."status" IN (${Prisma.join(PROPOSAL_SELECTION_STATUSES)}))::int AS "selections",
        COUNT(DISTINCT p."customerId") FILTER (WHERE p."status" IN (${Prisma.join(PROPOSAL_INTERVIEW_STATUSES)}))::int AS "interviews",
        COUNT(DISTINCT p."customerId") FILTER (WHERE p."status" IN (${Prisma.join(PROPOSAL_OFFER_STATUSES)}))::int AS "offers",
        COUNT(DISTINCT p."customerId") FILTER (WHERE p."status" IN (${Prisma.join(PROPOSAL_ACCEPTED_STATUSES)}))::int AS "accepted"
      FROM "JobProposal" p
      WHERE p."customerId" IN (SELECT "customerId" FROM cohort)
      GROUP BY 1
    `
    for (const r of proposalRows) {
      const row = rowFor(r.ca)
      row.proposals = r.proposals
      row.selections = r.selections
      row.interviews = r.interviews
      row.offers = r.offers
      row.accepted = r.accepted
    }
  } catch (e) {
    console.error('getKpi: proposal query failed (JobProposalテーブル未作成の可能性)', e)
  }

  // CA_OPTIONSの順を優先、その他は後ろに（その他同士は名前順で安定させる）
  const order = (ca: string) => {
    const i = CA_OPTIONS.indexOf(ca)
    return i === -1 ? CA_OPTIONS.length + 1 : i
  }
  return Array.from(rows.values()).sort((a, b) => order(a.ca) - order(b.ca) || a.ca.localeCompare(b.ca, 'ja'))
}
