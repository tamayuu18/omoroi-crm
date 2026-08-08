import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCustomers, createCustomer } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const params = request.nextUrl.searchParams
    // ステータスはカンマ区切りで複数指定できる（例: status=内定,承諾）
    const statusParam = params.get('status') ?? ''
    const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean)
    const status = statuses.length > 0 ? statuses : undefined
    const ca = params.get('ca') ?? undefined
    const yomiRank = params.get('yomi') ?? undefined
    const search = params.get('search') ?? undefined

    const sortBy = params.get('sortBy') ?? undefined
    const sortDir = params.get('sortDir') ?? undefined

    // page指定時はページネーション形式（{ customers, total, ... }）で返す。
    // 未指定時は従来どおり配列を返す（ダッシュボード等の後方互換）。
    const pageParam = params.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : undefined
    const pageSizeParam = parseInt(params.get('pageSize') ?? '', 10)
    const pageSize = Number.isFinite(pageSizeParam) ? Math.min(Math.max(pageSizeParam, 1), 100) : 30

    const { customers, total } = await getCustomers({ status, ca, yomiRank, search, sortBy, sortDir, page, pageSize })
    if (page) {
      return Response.json({ customers, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
    }
    return Response.json(customers)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const customer = await createCustomer(body)
    return Response.json(customer, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
