export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getKpi } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const month = request.nextUrl.searchParams.get('month')
      ?? new Date().toISOString().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return Response.json({ error: 'monthはYYYY-MM形式で指定してください' }, { status: 400 })
    }
    const rows = await getKpi(month)
    return Response.json({ month, rows })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to compute KPI' }, { status: 500 })
  }
}
