import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCustomerById, updateCustomerStatus, updateCustomerFields } from '@/lib/sheets'
import type { Customer } from '@/types'

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/customers/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const customer = await getCustomerById(id)
    if (!customer) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(customer)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch customer' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/customers/[id]'>
) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json() as Partial<Customer>
    if (body.status) {
      await updateCustomerStatus(id, body.status)
    }
    const { status: _s, ...rest } = body
    void _s
    if (Object.keys(rest).length > 0) {
      await updateCustomerFields(id, rest)
    }
    return Response.json({ success: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}
