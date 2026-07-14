-- 提案求人ごとの社内メモ（追記専用ログ）テーブルを追加する手動マイグレーション。
-- 上書き編集や削除のUIを設けず追記のみとすることで、過去のメモが消えないようにする。
-- ローカルにターミナルが無い場合は、この内容をSupabaseのSQL Editorに貼り付けて実行してください。
-- （ターミナルがある場合は `cd crm-app && npm run db:push` でも可）
-- 再実行しても安全なようにIF NOT EXISTSを付けています。

CREATE TABLE IF NOT EXISTS "ProposalNote" (
  "id"         TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "createdBy"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProposalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProposalNote_proposalId_idx" ON "ProposalNote"("proposalId");

DO $$ BEGIN
  ALTER TABLE "ProposalNote" ADD CONSTRAINT "ProposalNote_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "JobProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
