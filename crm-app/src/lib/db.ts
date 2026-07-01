import { prisma } from './prisma'
import type { Customer, Task, Meeting, History } from '@prisma/client'

export type { Customer, Task, Meeting, History }

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
