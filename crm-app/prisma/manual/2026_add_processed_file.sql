-- Nottaファイルの処理済み管理テーブル
-- 実行方法（既存の manual マイグレーションと同様）:
--   psql "$DATABASE_URL" -f prisma/manual/2026_add_processed_file.sql
-- もしくは prisma migrate / db push を使う運用ならそちらでも可。

CREATE TABLE IF NOT EXISTS "ProcessedFile" (
  "id"         TEXT PRIMARY KEY,
  "fileId"     TEXT NOT NULL UNIQUE,
  "fileName"   TEXT NOT NULL,
  "status"     TEXT NOT NULL,
  "customerId" TEXT,
  "personName" TEXT,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ProcessedFile_status_idx" ON "ProcessedFile" ("status");
