import { prisma } from '@/lib/prisma'

/**
 * テーブル作成（冪等）。
 *
 * ローカルにターミナルが無い環境（Vercel + Supabase/Neon だけで運用）向けに、
 * `npm run db:push` の代わりとして prisma/schema.prisma と同じ構造を SQL で作る。
 * すべて IF NOT EXISTS / 例外ガード付きなので、何度実行しても安全。
 * 新しいカラムやテーブルを schema.prisma に追加したら、ここにも追記すること。
 *
 * 呼び出し元: GET /api/setup（既存環境の更新）、GET /api/demo/seed（デモ環境の初期化）
 */
export async function ensureSchema() {
  // ---- Customer ----
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
  await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "expectedCloseMonth" TEXT`
  await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "expectedRevenue" TEXT`
  await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "feeRate" TEXT`
  await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "fixedFee" TEXT`
  await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "recommendation" TEXT`
  await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT`
  await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "birthDate" TEXT`
  await prisma.$executeRaw`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "education" TEXT`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Customer_status_idx" ON "Customer"("status")`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Customer_ca_idx" ON "Customer"("ca")`

  // ---- Task ----
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
  await prisma.$executeRaw`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assignee" TEXT`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Task_customerId_idx" ON "Task"("customerId")`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Task_deadline_idx" ON "Task"("deadline")`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status")`

  // ---- Meeting ----
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
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Meeting_customerId_idx" ON "Meeting"("customerId")`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Meeting_date_idx" ON "Meeting"("date")`

  // ---- History ----
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
  await prisma.$executeRaw`ALTER TABLE "History" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "History_customerId_idx" ON "History"("customerId")`

  // ---- Yomi ----
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
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Yomi_customerId_idx" ON "Yomi"("customerId")`

  // ---- Job ----
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "Job" (
      "id" TEXT NOT NULL,
      "company" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "area" TEXT,
      "salary" TEXT,
      "employment" TEXT,
      "feeRate" TEXT,
      "status" TEXT NOT NULL DEFAULT '募集中',
      "source" TEXT,
      "sourceUrl" TEXT,
      "detail" TEXT,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
    )
  `
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Job_status_idx" ON "Job"("status")`

  // ---- JobProposal ----
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "JobProposal" (
      "id" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "jobId" TEXT NOT NULL,
      "ca" TEXT,
      "status" TEXT NOT NULL DEFAULT '提案',
      "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "interviewDate" TIMESTAMP(3),
      "decidedAt" TIMESTAMP(3),
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JobProposal_pkey" PRIMARY KEY ("id")
    )
  `
  await prisma.$executeRaw`ALTER TABLE "JobProposal" ADD COLUMN IF NOT EXISTS "interviewDate" TIMESTAMP(3)`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "JobProposal_customerId_idx" ON "JobProposal"("customerId")`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "JobProposal_jobId_idx" ON "JobProposal"("jobId")`
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "JobProposal_proposedAt_idx" ON "JobProposal"("proposedAt")`
  await prisma.$executeRaw`
    DO $$ BEGIN
      ALTER TABLE "JobProposal" ADD CONSTRAINT "JobProposal_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `
  // 求人は提案履歴が残っている限り削除不可（RESTRICT）。旧環境の CASCADE 定義も置き換える。
  await prisma.$executeRaw`ALTER TABLE "JobProposal" DROP CONSTRAINT IF EXISTS "JobProposal_jobId_fkey"`
  await prisma.$executeRaw`
    ALTER TABLE "JobProposal" ADD CONSTRAINT "JobProposal_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  `

  // ---- ProposalNote ----
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "ProposalNote" (
      "id" TEXT NOT NULL,
      "proposalId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProposalNote_pkey" PRIMARY KEY ("id")
    )
  `
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "ProposalNote_proposalId_idx" ON "ProposalNote"("proposalId")`
  await prisma.$executeRaw`
    DO $$ BEGIN
      ALTER TABLE "ProposalNote" ADD CONSTRAINT "ProposalNote_proposalId_fkey"
        FOREIGN KEY ("proposalId") REFERENCES "JobProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `
}
