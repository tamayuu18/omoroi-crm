export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getJobs, createJob } from '@/lib/db'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const params = request.nextUrl.searchParams
    const status = params.get('status') ?? undefined
    const search = params.get('search') ?? undefined
    const jobs = await getJobs({ status, search })
    return Response.json(jobs)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.company || !body.title) {
      return Response.json({ error: '企業名と職種は必須です' }, { status: 400 })
    }
    const job = await createJob(body)
    return Response.json(job, { status: 201 })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to create job' }, { status: 500 })
  }
}
