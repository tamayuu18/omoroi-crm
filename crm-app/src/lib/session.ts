import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isDemoMode, DEMO_USER_NAME } from '@/lib/demo'

/**
 * ページ・APIルート共通のセッション取得。
 *
 * 通常は next-auth のセッション（Googleログイン）をそのまま返す。
 * DEMO_MODE=1 のときはログイン不要で、固定のデモユーザーを返す。
 * 認証チェックはすべてこの関数を経由させること（getServerSession を直接呼ばない）。
 */
export async function getAppSession(): Promise<Session | null> {
  if (isDemoMode()) {
    return {
      user: { name: DEMO_USER_NAME, email: 'demo@example.com', image: null },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  }
  return getServerSession(authOptions)
}
