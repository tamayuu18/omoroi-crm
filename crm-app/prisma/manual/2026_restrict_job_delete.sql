-- Job削除時にJobProposal（求人提案・面接日を含む）がカスケード削除されてしまう問題の修正。
-- 求人マスタから求人を削除すると、その求人を提案されていた全顧客の提案履歴が
-- 警告なく一括削除されていたため、提案履歴が残る求人は削除できないようにする。
-- ローカルにターミナルが無い場合は、この内容をSupabaseのSQL Editorに貼り付けて実行してください。
-- （ターミナルがある場合は `cd crm-app && npm run db:push` でも可）

ALTER TABLE "JobProposal" DROP CONSTRAINT IF EXISTS "JobProposal_jobId_fkey";

ALTER TABLE "JobProposal" ADD CONSTRAINT "JobProposal_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
