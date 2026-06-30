import { prisma } from './prisma'
import type { Customer, Task, Meeting, History, Job, JobProposal } from '@prisma/client'
import {
  CA_OPTIONS,
  PROPOSAL_SELECTION_STATUSES,
  PROPOSAL_OFFER_STATUSES,
  PROPOSAL_ACCEPTED_STATUSES,
} from './constants'
import type { KpiRow } from '@/types'

export type { Customer, Task, Meeting, History, Job, JobProposal }

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
      meetings: { orderBy: { date: 'asc' }, take: 1, select: { date: true } },
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

export async function updateCustomer(id: string, data: Partial<Customer>) {
  return prisma.customer.update({ where: { id }, data })
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
    include: { job: true },
    orderBy: { proposedAt: 'desc' },
  })
}

export async function createProposal(data: Omit<JobProposal, 'id' | 'createdAt' | 'updatedAt' | 'proposedAt' | 'decidedAt'> & { proposedAt?: Date }) {
  return prisma.jobProposal.create({ data, include: { job: true } })
}

export async function updateProposal(id: string, data: Partial<JobProposal>) {
  return prisma.jobProposal.update({ where: { id }, data, include: { job: true } })
}

export async function deleteProposal(id: string) {
  return prisma.jobProposal.delete({ where: { id } })
}

// ========== CA別KPI自動集計 ==========
// month: 'YYYY-MM'。面談はMeeting、求人提案/選考/内定/承諾はJobProposalから集計する。
export async function getKpi(month: string): Promise<KpiRow[]> {
  // 月初〜翌月初（[start, end)）
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, m ?? 1, 1)

  const [meetings, proposals] = await Promise.all([
    prisma.meeting.findMany({
      where: { date: { gte: start, lt: end }, status: { not: 'キャンセル' } },
      select: { ca: true, status: true, result: true },
    }),
    prisma.jobProposal.findMany({
      where: { proposedAt: { gte: start, lt: end } },
      select: { ca: true, status: true },
    }),
  ])

  // CAごとに行を初期化（既定CA＋データ中の未知CAを網羅）
  const cas = new Set<string>(CA_OPTIONS)
  meetings.forEach(x => { if (x.ca) cas.add(x.ca) })
  proposals.forEach(x => { if (x.ca) cas.add(x.ca) })

  const rows = new Map<string, KpiRow>()
  for (const ca of cas) {
    rows.set(ca, { ca, meetingsSet: 0, firstMeetings: 0, proposals: 0, selections: 0, offers: 0, accepted: 0 })
  }

  const isHeld = (s?: string | null, r?: string | null) =>
    !!r || (!!s && ['実施', '実施済', '面談実施済み', '完了'].includes(s))

  for (const mtg of meetings) {
    const row = rows.get(mtg.ca ?? '') ?? rows.get('未割当') ?? (() => {
      const r: KpiRow = { ca: '未割当', meetingsSet: 0, firstMeetings: 0, proposals: 0, selections: 0, offers: 0, accepted: 0 }
      rows.set('未割当', r); return r
    })()
    row.meetingsSet++
    if (isHeld(mtg.status, mtg.result)) row.firstMeetings++
  }

  for (const p of proposals) {
    const row = rows.get(p.ca ?? '') ?? rows.get('未割当') ?? (() => {
      const r: KpiRow = { ca: '未割当', meetingsSet: 0, firstMeetings: 0, proposals: 0, selections: 0, offers: 0, accepted: 0 }
      rows.set('未割当', r); return r
    })()
    row.proposals++
    if (PROPOSAL_SELECTION_STATUSES.includes(p.status)) row.selections++
    if (PROPOSAL_OFFER_STATUSES.includes(p.status)) row.offers++
    if (PROPOSAL_ACCEPTED_STATUSES.includes(p.status)) row.accepted++
  }

  // CA_OPTIONSの順を優先、その他は後ろに
  const order = (ca: string) => {
    const i = CA_OPTIONS.indexOf(ca)
    return i === -1 ? CA_OPTIONS.length + 1 : i
  }
  return Array.from(rows.values()).sort((a, b) => order(a.ca) - order(b.ca))
}
