export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { scrapeJob } from '@/lib/jobScrape'

// 求人票URLを受け取り、Jobフォーム用の下書きを返す。
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { url } = await request.json()
    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'urlを指定してください' }, { status: 400 })
    }
    const draft = await scrapeJob(url)
    return Response.json(draft)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to scrape job' }, { status: 500 })
  }
}
