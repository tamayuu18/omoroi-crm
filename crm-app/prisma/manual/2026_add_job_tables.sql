-- Job / JobProposal テーブルを作成する手動マイグレーション。
-- ローカルにターミナルが無い場合は、この内容を Supabase の SQL Editor に貼り付けて Run してください。
-- （ターミナルがある場合は `cd crm-app && npm run db:push` でも可）
-- 再実行しても安全なように IF NOT EXISTS / 例外ガードを付けています。

CREATE TABLE IF NOT EXISTS "Job" (
  "id"         TEXT NOT NULL,
  "company"    TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "area"       TEXT,
  "salary"     TEXT,
  "employment" TEXT,
  "feeRate"    TEXT,
  "status"     TEXT NOT NULL DEFAULT '募集中',
  "source"     TEXT,
  "sourceUrl"  TEXT,
  "detail"     TEXT,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JobProposal" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "jobId"      TEXT NOT NULL,
  "ca"         TEXT,
  "status"     TEXT NOT NULL DEFAULT '提案',
  "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt"  TIMESTAMP(3),
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Job_status_idx" ON "Job"("status");
CREATE INDEX IF NOT EXISTS "JobProposal_customerId_idx" ON "JobProposal"("customerId");
CREATE INDEX IF NOT EXISTS "JobProposal_jobId_idx" ON "JobProposal"("jobId");
CREATE INDEX IF NOT EXISTS "JobProposal_proposedAt_idx" ON "JobProposal"("proposedAt");

DO $$ BEGIN
  ALTER TABLE "JobProposal" ADD CONSTRAINT "JobProposal_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "JobProposal" ADD CONSTRAINT "JobProposal_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
