export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getAppSession } from '@/lib/session'
import { getCustomerById, updateCustomer } from '@/lib/db'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/customers/[id]'>
) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const customer = await getCustomerById(id)
    if (!customer) return Response.json({ error: 'Not found' }, { status: 404 })
    // 写真は base64 を同梱せず、キャッシュ可能な画像URLに置き換えて返す
    const { hasPhoto, ...rest } = customer
    const photoUrl = hasPhoto ? `/api/customers/${id}/photo?v=${customer.updatedAt.getTime()}` : null
    return Response.json({ ...rest, photoUrl })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch customer' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/customers/[id]'>
) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await request.json()
    const customer = await updateCustomer(id, body)
    return Response.json(customer)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<'/api/customers/[id]'>
) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    await prisma.history.deleteMany({ where: { customerId: id } })
    await prisma.meeting.deleteMany({ where: { customerId: id } })
    await prisma.task.deleteMany({ where: { customerId: id } })
    await prisma.customer.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to delete customer' }, { status: 500 })
  }
}
