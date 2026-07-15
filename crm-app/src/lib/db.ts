import { prisma } from './prisma'
import type { Customer, Task, Meeting, History, Job, JobProposal, ProposalNote } from '@prisma/client'
import {
  CA_OPTIONS,
  PROPOSAL_SELECTION_STATUSES,
  PROPOSAL_INTERVIEW_STATUSES,
  PROPOSAL_OFFER_STATUSES,
  PROPOSAL_ACCEPTED_STATUSES,
} from './constants'
import type { KpiRow } from '@/types'

export type { Customer, Task, Meeting, History, Job, JobProposal, ProposalNote }

export async function getCustomers(filters?: { status?: string; ca?: string; yomiRank?: string; search?: string; sortBy?: string; sortDir?: string }) {
  const where: any = {}
  if (filters?.status) where.status = filters.status
  if (filters?.ca) where.ca = filters.ca
  if (filters?.yomiRank) where.yomiRank = filters.yomiRank
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { phone: { contains: filters.search } },
      { email: { contains: filters.search } },
    ]
  }
  const dir = filters?.sortDir === 'asc' ? 'asc' : 'desc'
  // Prisma does not support ordering findMany by a related model's _min/_max
  // aggregate, so 初回面談日 (firstMeeting) is sorted in memory below.
  const validSorts: Record<string, any> = {
    name: { name: dir },
    registeredAt: { registeredAt: dir },
    updatedAt: { updatedAt: dir },
    nextDeadline: { nextDeadline: dir },
    status: { status: dir },
  }
  const orderBy = validSorts[filters?.sortBy ?? ''] ?? { updatedAt: 'desc' }
  const customers = await prisma.customer.findMany({
    where,
    orderBy,
    include: {
      meetings: { where: { status: { not: 'キャンセル' } }, orderBy: { date: 'asc' }, take: 1, select: { date: true } },
      tasks: { where: { status: { not: '完了' } }, select: { id: true }, take: 1 },
    },
  })

  if (filters?.sortBy === 'firstMeeting') {
    const factor = dir === 'asc' ? 1 : -1
    customers.sort((a, b) => {
      const aDate = a.meetings[0]?.date
      const bDate = b.meetings[0]?.date
      // Customers without a meeting date sort to the end regardless of direction.
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      return (aDate.getTime() - bDate.getTime()) * factor
    })
  }

  return customers
}

export async function getCustomerById(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { deadline: 'asc' } },
      meetings: { orderBy: { date: 'desc' } },
      history: { orderBy: { date: 'desc' } },
    },
  })
}

export async function createCustomer(data: Omit<Customer, 'id' | 'registeredAt' | 'updatedAt'>) {
  return prisma.customer.create({ data })
}

// 面談がまだ「実施済み」とみなせない顧客ステータス（これら以外は面談実施後のステータス）
export const PRE_INTERVIEW_STATUSES = [
  '新規送客', '初回未対応', '初回連絡済み', '不通', '面談予約済み', '面談キャンセル', 'リスケ調整中',
]

async function syncMeetingHeldStatus(customerId: string, status?: string | null) {
  if (!status || PRE_INTERVIEW_STATUSES.includes(status)) return
  const meeting = await prisma.meeting.findFirst({
    where: { customerId, status: { notIn: ['キャンセル', '完了'] } },
    orderBy: { date: 'desc' },
  })
  if (meeting) {
    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: '完了' } })
  }
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  const customer = await prisma.customer.update({ where: { id }, data })

  // ステータスが面談実施後の段階に変わった際、対応する直近の面談レコードにも
  // 実施結果を反映する。KPI集計(getKpi)はMeeting.statusを見て初回面談数を数えるため、
  // Customer.statusだけ更新してもMeetingが未更新のままだとKPIに反映されない。
  if (data.status) await syncMeetingHeldStatus(id, data.status)

  return customer
}

export async function getTasks(filters?: { customerId?: string; ca?: string }) {
  const where: any = {}
  if (filters?.customerId) where.customerId = filters.customerId
  if (filters?.ca) where.ca = filters.ca
  return prisma.task.findMany({ where, orderBy: { deadline: 'asc' } })
}

export async function updateTask(id: string, data: Partial<Task>) {
  return prisma.task.update({ where: { id }, data })
}

export async function getMeetings(filters?: { customerId?: string }) {
  const where: any = {}
  if (filters?.customerId) where.customerId = filters.customerId
  return prisma.meeting.findMany({ where, orderBy: { date: 'desc' } })
}

export async function createMeeting(data: Omit<Meeting, 'id' | 'createdAt'>) {
  return prisma.meeting.create({ data })
}

export async function updateMeeting(id: string, data: Partial<Meeting>) {
  return prisma.meeting.update({ where: { id }, data })
}

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
export async function getJobs(filters?: { status?: string; search?: string }) {
  const where: any = {}
  if (filters?.status) where.status = filters.status
  if (filters?.search) {
    where.OR = [
      { company: { contains: filters.search } },
      { title: { contains: filters.search } },
      { area: { contains: filters.search } },
    ]
  }
  return prisma.job.findMany({ where, orderBy: { updatedAt: 'desc' } })
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
export async function getProposals(filters?: { customerId?: string; jobId?: string }) {
  const where: any = {}
  if (filters?.customerId) where.customerId = filters.customerId
  if (filters?.jobId) where.jobId = filters.jobId
  return prisma.jobProposal.findMany({
    where,
    include: { job: true, proposalNotes: { orderBy: { createdAt: 'asc' } } },
    orderBy: { proposedAt: 'desc' },
  })
}

export async function createProposal(data: Omit<JobProposal, 'id' | 'createdAt' | 'updatedAt' | 'proposedAt' | 'decidedAt' | 'interviewDate'> & { proposedAt?: Date }) {
  return prisma.jobProposal.create({ data, include: { job: true, proposalNotes: true } })
}

export async function updateProposal(id: string, data: Partial<JobProposal>) {
  return prisma.jobProposal.update({ where: { id }, data, include: { job: true, proposalNotes: { orderBy: { createdAt: 'asc' } } } })
}

export async function deleteProposal(id: string) {
  return prisma.jobProposal.delete({ where: { id } })
}

// ========== 提案ごとの社内メモ（追記専用） ==========
export async function addProposalNote(proposalId: string, data: { content: string; createdBy?: string | null }) {
  return prisma.proposalNote.create({ data: { proposalId, content: data.content, createdBy: data.createdBy ?? null } })
}

// ========== CA別KPI自動集計 ==========
// month: 'YYYY-MM'。面談設定数/初回面談数はMeetingの面談日基準で集計する。
// 求人提案数/選考数/面接数/内定数/内定承諾数は、求職者の初回面談月を基準に集計する
// （その求職者への提案・選考等が実際に発生した月ではなく、初回面談があった月の実績として計上する）。
// すべての指標は人数ベース：同一求職者に複数の面談・提案があっても各段階で1人として数える。
export async function getKpi(month: string): Promise<KpiRow[]> {
  // 月初〜翌月初（[start, end)）
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, m ?? 1, 1)

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

  // 面談と提案は別々に取得し、片方が失敗（例: 提案テーブル未作成）しても集計を続行する
  let meetings: { ca: string | null; status: string; result: string | null; customerId: string; customer: { status: string } | null }[] = []
  let proposals: { ca: string | null; status: string; customerId: string }[] = []
  try {
    meetings = await prisma.meeting.findMany({
      where: { date: { gte: start, lt: end }, status: { not: 'キャンセル' } },
      select: { ca: true, status: true, result: true, customerId: true, customer: { select: { status: true } } },
    })
  } catch (e) {
    console.error('getKpi: meeting query failed', e)
  }
  try {
    // 求人提案以降(求人提案数/選考数/内定数/内定承諾数)は「発生日」ではなく
    // 「初回面談月」を基準に集計する。例: 6月に初回面談をした求職者が7月に
    // 求人提案されても、その提案は6月の実績として数える。
    // そのため、まず対象月に初回面談（最も古い非キャンセル面談）を迎えた
    // 求職者を特定し、その求職者の提案を発生時期に関わらずすべて集計する。
    const firstMeetingByCustomer = await prisma.meeting.groupBy({
      by: ['customerId'],
      where: { status: { not: 'キャンセル' }, date: { not: null } },
      _min: { date: true },
    })
    const cohortCustomerIds = firstMeetingByCustomer
      .filter((f) => {
        const d = f._min.date
        return d && d >= start && d < end
      })
      .map((f) => f.customerId)

    proposals = await prisma.jobProposal.findMany({
      where: { customerId: { in: cohortCustomerIds } },
      select: { ca: true, status: true, customerId: true },
    })
  } catch (e) {
    console.error('getKpi: proposal query failed (JobProposalテーブル未作成の可能性)', e)
  }

  // Meeting自体が「実施済み」を表すstatus/resultを持つか、または紐づく顧客が
  // 面談実施後の段階まで進んでいれば「面談は実施済み」とみなす（顧客側だけステータスを
  // 更新して面談レコードが未同期のケースの救済も兼ねる）
  const isHeld = (s?: string | null, r?: string | null, customerStatus?: string | null) =>
    !!r
    || (!!s && ['実施', '実施済', '面談実施済み', '完了'].includes(s))
    || (!!customerStatus && !PRE_INTERVIEW_STATUSES.includes(customerStatus))

  // すべての指標を人数で数えるため、CA×指標ごとに求職者IDの集合で重複を除外する
  const seenCustomers = new Map<string, Set<string>>()
  const countOnce = (ca: string | null | undefined, metric: keyof Omit<KpiRow, 'ca'>, customerId: string) => {
    const key = `${ca || '未割当'}:${metric}`
    let seen = seenCustomers.get(key)
    if (!seen) { seen = new Set(); seenCustomers.set(key, seen) }
    if (seen.has(customerId)) return
    seen.add(customerId)
    rowFor(ca)[metric]++
  }

  for (const mtg of meetings) {
    countOnce(mtg.ca, 'meetingsSet', mtg.customerId)
    if (isHeld(mtg.status, mtg.result, mtg.customer?.status)) countOnce(mtg.ca, 'firstMeetings', mtg.customerId)
  }

  for (const p of proposals) {
    countOnce(p.ca, 'proposals', p.customerId)
    if (PROPOSAL_SELECTION_STATUSES.includes(p.status)) countOnce(p.ca, 'selections', p.customerId)
    if (PROPOSAL_INTERVIEW_STATUSES.includes(p.status)) countOnce(p.ca, 'interviews', p.customerId)
    if (PROPOSAL_OFFER_STATUSES.includes(p.status)) countOnce(p.ca, 'offers', p.customerId)
    if (PROPOSAL_ACCEPTED_STATUSES.includes(p.status)) countOnce(p.ca, 'accepted', p.customerId)
  }

  // CA_OPTIONSの順を優先、その他は後ろに
  const order = (ca: string) => {
    const i = CA_OPTIONS.indexOf(ca)
    return i === -1 ? CA_OPTIONS.length + 1 : i
  }
  return Array.from(rows.values()).sort((a, b) => order(a.ca) - order(b.ca))
}
