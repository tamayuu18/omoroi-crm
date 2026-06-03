import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCustomers } from '@/lib/sheets'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customers = await getCustomers()
    const params = request.nextUrl.searchParams
    const status = params.get('status')
    const ca = params.get('ca')
    const search = params.get('search')
    const yomi = params.get('yomi')

    let filtered = customers
    if (status) filtered = filtered.filter((c) => c.status === status)
    if (ca) filtered = filtered.filter((c) => c.ca === ca)
    if (yomi) filtered = filtered.filter((c) => c.yomiRank === yomi)
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.kana.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q)
      )
    }

    return Response.json(filtered)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}
