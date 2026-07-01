export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { scrapeJob, scrapeFromHtml, detectSource } from '@/lib/jobScrape'

// 求人票URL（またはページのHTML）を受け取り、Jobフォーム用の下書きを返す。
// html を渡した場合はサーバー取得せず、そのHTMLから抽出する（bot対策等でサーバー取得できない媒体向け）。
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { url, html } = await request.json()
    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'urlを指定してください' }, { status: 400 })
    }
    if (html && typeof html === 'string') {
      const draft = scrapeFromHtml(detectSource(url), html, url)
      return Response.json(draft)
    }
    const draft = await scrapeJob(url)
    return Response.json(draft)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Failed to scrape job' }, { status: 500 })
  }
}
