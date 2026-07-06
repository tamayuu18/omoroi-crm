-- JobProposal に面接日（求人ごとの面接日）カラムを追加する手動マイグレーション。
-- ローカルにターミナルが無い場合は、この内容を Supabase の SQL Editor に貼り付けて Run してください。
-- （ターミナルがある場合は `cd crm-app && npm run db:push` でも可）
-- 再実行しても安全なように IF NOT EXISTS を付けています。

ALTER TABLE "JobProposal" ADD COLUMN IF NOT EXISTS "interviewDate" TIMESTAMP(3);
