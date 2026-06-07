import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCustomers, createCustomer } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const params = request.nextUrl.searchParams
    const status = params.get('status') ?? undefined
    const ca = params.get('ca') ?? undefined
    const yomiRank = params.get('yomi') ?? undefined
    const search = params.get('search') ?? undefined

    const sortBy = params.get('sortBy') ?? undefined
    const sortDir = params.get('sortDir') ?? undefined
    const customers = await getCustomers({ status, ca, yomiRank, search, sortBy, sortDir })
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
