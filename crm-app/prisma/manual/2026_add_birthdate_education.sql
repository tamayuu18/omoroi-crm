-- 顧客の基本情報に「生年月日」「最終学歴」カラムを追加する手動マイグレーション。
-- 生年月日(birthDate)は YYYY-MM-DD 形式のテキストで保存し、年齢はアプリ側で自動算出する。
-- ローカルにターミナルが無い場合は、この内容をSupabaseのSQL Editorに貼り付けて実行してください。
-- （ターミナルがある場合は `cd crm-app && npm run db:push` でも可）
-- 再実行しても安全なようにIF NOT EXISTSを付けています。

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "birthDate" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "education" TEXT;
