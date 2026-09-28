export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getAppSession } from '@/lib/session'
import { getCustomerPhoto } from '@/lib/db'

/**
 * GET /api/customers/[id]/photo
 *
 * 証明写真を画像として返す。写真は Customer.photoUrl に base64 の data URL で保存されているが、
 * 顧客詳細のJSONに同梱すると画面更新のたびに数百KB〜2MBが転送されるため、
 * ここで画像本体だけを切り出し、ブラウザにキャッシュさせる。
 * URL には ?v=<updatedAt> を付けて呼び出すので、長期キャッシュにして問題ない。
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/customers/[id]/photo'>
) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const photo = await getCustomerPhoto(id)
    if (!photo) return new Response(null, { status: 404 })

    const m = photo.photoUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/)
    if (!m) return new Response(null, { status: 404 })
    const contentType = m[1] || 'application/octet-stream'
    const body = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8')

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        // 認証済みユーザーのブラウザにだけ長期キャッシュさせる（共有キャッシュには載せない）
        'Cache-Control': 'private, max-age=31536000, immutable',
        'ETag': `"${id}-${photo.updatedAt.getTime()}"`,
      },
    })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch photo' }, { status: 500 })
  }
}
