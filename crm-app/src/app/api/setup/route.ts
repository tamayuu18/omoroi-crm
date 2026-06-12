import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Customer" (
        "id" TEXT NOT NULL,
        "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "inflow" TEXT,
        "foresmaId" TEXT,
        "name" TEXT NOT NULL,
        "kana" TEXT,
        "phone" TEXT,
        "email" TEXT,
        "age" TEXT,
        "gender" TEXT,
        "area" TEXT,
        "company" TEXT,
        "job" TEXT,
        "salary" TEXT,
        "hopeJob" TEXT,
        "hopeArea" TEXT,
        "hopeSalary" TEXT,
        "timing" TEXT,
        "ca" TEXT,
        "status" TEXT NOT NULL DEFAULT '初回未対応',
        "yomiRank" TEXT,
        "nextAction" TEXT,
        "nextDeadline" TIMESTAMP(3),
        "lastContact" TIMESTAMP(3),
        "note" TEXT,
        CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
      )
    `
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Task" (
        "id" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "ca" TEXT,
        "content" TEXT NOT NULL,
        "deadline" TIMESTAMP(3),
        "status" TEXT NOT NULL DEFAULT '未対応',
        "priority" TEXT,
        "relatedStatus" TEXT,
        "doneAt" TIMESTAMP(3),
        "note" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Meeting" (
        "id" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "ca" TEXT,
        "date" TIMESTAMP(3),
        "startTime" TEXT,
        "endTime" TEXT,
        "method" TEXT,
        "status" TEXT NOT NULL DEFAULT '予約済',
        "remind" TEXT,
        "result" TEXT,
        "temp" TEXT,
        "proposal" TEXT,
        "nextAction" TEXT,
        "nextDeadline" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Meeting_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "History" (
        "id" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "ca" TEXT,
        "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "type" TEXT,
        "result" TEXT,
        "content" TEXT,
        "nextContent" TEXT,
        "nextDeadline" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "History_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "History_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Yomi" (
        "id" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "ca" TEXT,
        "status" TEXT,
        "rank" TEXT,
        "probability" TEXT,
        "expectedMonth" TEXT,
        "expectedJoinDate" TIMESTAMP(3),
        "expectedSalary" TEXT,
        "feeRate" TEXT,
        "expectedRevenue" TEXT,
        "weightedRevenue" TEXT,
        "reason" TEXT,
        "obstacles" TEXT,
        "nextAction" TEXT,
        "nextDeadline" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Yomi_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Yomi_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `
    // マイグレーション: 新規カラム追加
    await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "expectedCloseMonth" TEXT`
    await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "expectedRevenue" TEXT`
    await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "feeRate" TEXT`
    await prisma.$executeRaw`ALTER TABLE "History" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`
    await prisma.$executeRaw`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assignee" TEXT`
    await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "recommendation" TEXT`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Customer_status_idx" ON "Customer"("status")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Customer_ca_idx" ON "Customer"("ca")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Task_customerId_idx" ON "Task"("customerId")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Meeting_customerId_idx" ON "Meeting"("customerId")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "History_customerId_idx" ON "History"("customerId")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Yomi_customerId_idx" ON "Yomi"("customerId")`

    return NextResponse.json({ ok: true, message: 'Tables created successfully' })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
