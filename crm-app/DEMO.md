# デモ環境（お試し版）の立て方

他社にお試しで触ってもらうための、**ログイン不要・サンプルデータ入り**の環境を作る手順です。
本番（自社）環境とは **別のVercelプロジェクト・別のDB** で動かします。自社の顧客データは一切含まれません。

## 仕組み

- 環境変数 `DEMO_MODE=1` を設定すると、Googleログインなしで全画面・全APIが使えます。
- 画面上部に「デモ版」バッジが出て、ログアウトボタンは非表示になります。
- `GET /api/demo/seed` を1回開くと、架空の顧客・求人・面談・タスク等が投入されます（`DEMO_MODE=1` のときだけ動作）。
- 担当CA名・アプリ名は環境変数で差し替えられます（自社の社員名を出さないため）。

> **絶対に本番環境で `DEMO_MODE=1` を設定しないでください。** 認証が完全に外れます。

## 手順

### 1. デモ用DBを用意する

Neon / Supabase 等で **新規** のPostgreSQLを作成し、接続文字列を控えます。
自社DBの接続文字列は使わないこと。

Supabase の場合、プロジェクト画面の「Connect」ボタン → 「Session pooler」のURIをコピーします。
次のような形で、`[YOUR-PASSWORD]` の部分をプロジェクト作成時に決めたDBパスワードに置き換えます。

```
postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

`sb_publishable_...` や `eyJ...` で始まる文字列はAPIキーであって接続文字列ではないので使えません。

### 2. Vercelに新しいプロジェクトを作る

- 同じGitHubリポジトリを選び、Root Directory を `crm-app` にする。
- 環境変数を以下のとおり設定する。

| 変数 | 値 | 備考 |
|---|---|---|
| `DEMO_MODE` | `1` | 認証をスキップ |
| `DATABASE_URL` | デモ用DBの接続文字列 | `postgresql://...` で始まるもの（下記参照） |
| `NEXTAUTH_SECRET` | 適当なランダム文字列 | next-auth の起動に必要（`openssl rand -base64 32` 等） |
| `NEXTAUTH_URL` | デモ環境のURL | 例: `https://xxx-demo.vercel.app` |
| `NEXT_PUBLIC_APP_NAME` | 例: `CRM デモ版` | 画面のアプリ名 |
| `NEXT_PUBLIC_CA_OPTIONS` | 例: `担当A,担当B,担当C` | 担当CAの選択肢（カンマ区切り）。未設定だと自社の社員名が出る |
| `NEXT_PUBLIC_ASSIGNEE_EXTRA` | 例: `アシスタントD` | 任意。CA以外のタスク担当者 |
| `DEMO_USER_NAME` | 例: `デモユーザー` | 任意。履歴の記録者名に使われる |

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ALLOWED_EMAILS` / `INGEST_SECRET` / `CRON_SECRET` / `ANTHROPIC_API_KEY` / Google Drive 系は **設定不要** です（Lreach・TimeRex・Notta連携は動きません。デモでは不要）。

### 3. テーブル作成とサンプルデータ投入（ブラウザだけで完了）

デプロイが終わったら、ブラウザで次のURLを開くだけです。ローカルのターミナルは不要です。

```
https://<デモ環境のURL>/api/demo/seed
```

テーブルが無ければ自動で作成してから、サンプルデータを投入します。
`{"ok":true,"seeded":true,...}` が返れば完了。顧客15件・求人6件・面談・提案・履歴・タスクが入ります。

（`<デモ環境のURL>` の部分は Vercel が発行したURLに置き換えてください。山かっこは書きません。）

### 4. デモURLを渡す

トップページを開くとそのまま顧客一覧が表示されます。

## デモをリセットする

先方が触って汚れたデータを初期状態に戻す:

```
https://<デモ環境のURL>/api/demo/seed?reset=1
```

全データを消してからサンプルを入れ直します。

## 本番導入時

`DEMO_MODE` を外し、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ALLOWED_EMAILS`（先方担当者のGoogleアカウント）を設定すれば、そのまま先方の本番環境になります。
`NEXT_PUBLIC_CA_OPTIONS` に先方の担当者名を設定してください。
