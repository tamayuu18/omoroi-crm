/**
 * デモモード。
 *
 * 環境変数 DEMO_MODE=1 を設定すると、Googleログインなしで全画面・全APIを
 * 利用できるようになります。他社へのお試し提供（デモ環境）専用のフラグです。
 *
 * 注意: デモモードは認証を完全に外すため、必ず本番とは別のDB（DATABASE_URL）を
 * 指した別デプロイでのみ有効にしてください。本番環境では絶対に設定しないこと。
 */
export function isDemoMode(): boolean {
  const v = (process.env.DEMO_MODE ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on'
}

/** デモモード時にログインユーザーとして扱う表示名 */
export const DEMO_USER_NAME = process.env.DEMO_USER_NAME || 'デモユーザー'
