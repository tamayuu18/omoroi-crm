-- JobProposal に応募日（企業への書類提出日）カラムを追加する手動マイグレーション。
-- 提案のステータスが「応募」以降に進んだ時にアプリが自動で記録し、手入力でも修正できる。
-- KPIの「初回面談から書類提出までの営業日数」はこの列を使って計算する。
-- ローカルにターミナルが無い場合は、この内容を Supabase の SQL Editor に貼り付けて Run するか、
-- デプロイ後にブラウザで /api/setup を開いてください。
-- （ターミナルがある場合は `cd crm-app && npm run db:push` でも可）
-- 再実行しても安全なように IF NOT EXISTS を付けています。

ALTER TABLE "JobProposal" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
