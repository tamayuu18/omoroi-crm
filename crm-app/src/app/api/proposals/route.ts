export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProposals, createProposal } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const params = request.nextUrl.searchParams
    const customerId = params.get('customerId') ?? undefined
    const jobId = params.get('jobId') ?? undefined
    const proposals = await getProposals({ customerId, jobId })
    return Response.json(proposals)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch proposals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.customerId || !body.jobId) {
      return Response.json({ error: 'customerIdとjobIdは必須です' }, { status: 400 })
    }
    const proposal = await createProposal({
      customerId: body.customerId,
      jobId: body.jobId,
      ca: body.ca ?? null,
      status: body.status ?? '提案',
      note: body.note ?? null,
    })
    return Response.json(proposal, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to create proposal' }, { status: 500 })
  }
}
