# Notta → 議事録 → CRM（顧客History）自動連携 セットアップ手順

CRMアプリ（omoroi-crm / Next.js + Prisma on Vercel）に **Vercel Cron** を追加し、
CRM自身が2時間おきにGoogleドライブのNottaフォルダを走査して、
文字起こしから議事録を生成し、対応する顧客の対応履歴（History, type=議事録）に追加します。

Claudeのクラウド環境は外向きHTTPが遮断されているため、CRM側で完結するこの方式（Pull型）を採用します。

---

## 追加・変更するファイル

| 配置先 | 内容 |
|---|---|
| `prisma/schema.prisma` | `schema-additions.prisma` の `ProcessedFile` model を追記 |
| `prisma/manual/2026_add_processed_file.sql` | 処理済み管理テーブルの手動マイグレーション |
| `src/lib/googleDrive.ts` | Driveサービスアカウント・一覧/本文取得 |
| `src/lib/meetingMinutes.ts` | 議事録生成（Anthropic）＋顧客照合 |
| `src/app/api/cron/notta/route.ts` | 定期実行の本体 |
| `vercel.json` | cronスケジュール（既存があれば `crons` を統合） |
| `src/app/api/ingest/meeting/route.ts` | （任意）手動/外部からの議事録POST用エンドポイント |

> パスエイリアス `@/lib/prisma` は既存の lreach ルートと同じ前提です。

---

## 1. 依存パッケージ

```bash
npm install googleapis
```

（議事録生成は Anthropic Messages API を `fetch` で呼ぶのでSDK不要）

## 2. Googleサービスアカウントの用意

1. Google Cloud Console でプロジェクトを用意し、「IAMと管理 → サービスアカウント」で作成。
2. そのサービスアカウントで **JSONキー** を発行。
3. **Google Drive API** を有効化（「APIとサービス → ライブラリ」）。
4. Googleドライブで **Nottaフォルダ** を、作成したサービスアカウントのメール
   （例: `notta-bot@xxxx.iam.gserviceaccount.com`）に「**閲覧者**」で共有。

## 3. 環境変数（Vercel → Settings → Environment Variables, Production）

| 変数 | 値 |
|---|---|
| `NOTTA_FOLDER_ID` | `1ORLVulN_QrNn2QyAJ49eHfDZ3-YjFHac` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | サービスアカウントのメール |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | JSONキーの `private_key`（改行を `\n` にエスケープした1行） |
| `ANTHROPIC_API_KEY` | 議事録生成に使用（未設定なら文字起こしをそのまま記録） |
| `ANTHROPIC_MODEL` | 例: `claude-sonnet-5`（未設定時のデフォルト。現行のモデルIDに合わせる） |
| `CRON_SECRET` | 任意の長いランダム文字列（Vercel Cronの認証に使用） |

> `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` は、JSONの `private_key` 値をそのまま貼り付けでOK
> （`-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`）。コード側で `\n` を実改行に戻します。

## 4. DBマイグレーション

既存の manual 運用に合わせて実行:

```bash
psql "$DATABASE_URL" -f prisma/manual/2026_add_processed_file.sql
npx prisma generate
```

（`prisma migrate`/`db push` 運用ならそちらでも可。`schema.prisma` への追記後に generate を忘れずに）

## 5. デプロイ

`vercel.json` の `crons` を含めてデプロイすると、Vercelがcronを登録します。

- スケジュール `0 0,2,4,6,8,10,12,14 * * *`（UTC）＝ **日本時間 9・11・13・15・17・19・21・23時** に実行。
- **注意**: 2時間おきのcronは **Vercel Pro以上** が必要です（Hobbyプランは日次1回のみ）。

## 6. 動作確認

1. Nottaフォルダに、ファイル名に既存顧客の氏名が入ったGoogleドキュメントを1つ用意。
2. 手動実行:
   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" https://omoroi-crm.vercel.app/api/cron/notta
   ```
   → `{"status":"ok","added":1,...}` が返り、CRMの該当顧客の履歴に議事録が追加される。
3. もう一度叩いても `skipped` になり、二重追加されないことを確認。

---

## 挙動メモ

- **顧客照合**: 生成時に本文から抽出した email > phone > 氏名 の順で `Customer` を照合。
  氏名はファイル名からも補完。該当が無ければ `status=unmatched` として記録し、履歴は作りません。
- **二重防止**: `ProcessedFile.fileId` で管理。`added`/`empty`/`unmatched` は再処理せず、
  `error` のみ最大3回まで再試行します。
- **unmatchedを後から取り込みたい場合**: 顧客を登録後、`ProcessedFile` の該当行を削除すれば次回実行で再取込されます。
- 生成モデルは `ANTHROPIC_MODEL` で差し替え可能。未設定時のデフォルト値が古い場合は現行IDに更新してください。
