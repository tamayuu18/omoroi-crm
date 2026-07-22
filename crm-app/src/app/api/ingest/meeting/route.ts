import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/ingest/meeting
 *
 * Nottaの文字起こしから生成した議事録を、既存の顧客に「対応履歴(History)」として追加する。
 * 認証は lreach と同じ x-ingest-token ヘッダ（= process.env.INGEST_SECRET）。
 *
 * Body:
 * {
 *   "records": [
 *     {
 *       // --- 顧客特定（いずれか。上から優先） ---
 *       "customerId": "cuid...",      // 分かっていれば最優先
 *       "name":  "山田太郎",           // 無ければ email → phone → name の順で照合
 *       "email": "taro@example.com",
 *       "phone": "09012345678",
 *
 *       // --- 議事録本体 ---
 *       "content": "## 要約\n...\n## 決定事項\n...\n## ToDo\n...",  // 必須・markdown
 *       "date":    "2026-07-22T13:00:00+09:00",  // 面談日時（省略時は現在）
 *       "ca":      "佐藤",                         // 担当CA（省略時は顧客のca）
 *       "result":  "一次面談実施。志望度高。",       // 面談結果サマリ（任意）
 *       "nextContent":  "求人3件を提案",            // 次回アクション（任意）
 *       "nextDeadline": "2026-07-29",              // 次回期日（任意）
 *
 *       // --- 重複防止（Nottaの元ファイルID） ---
 *       "sourceFileId": "1AbC..."   // 同一顧客に同じ元ファイルの議事録が既にあればスキップ
 *     }
 *   ]
 * }
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-ingest-token') || ''
  if (process.env.INGEST_SECRET && token !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const records = body.records as any[]
  if (!records?.length) {
    return NextResponse.json({ error: 'no records' }, { status: 400 })
  }

  let added = 0
  let skipped = 0
  let notMatched = 0
  const results: any[] = []

  for (const rec of records) {
    // 1) 顧客を特定
    let customer = null as null | { id: string; name: string; ca: string | null }
    const select = { id: true, name: true, ca: true }

    if (rec.customerId) {
      customer = await prisma.customer.findUnique({
        where: { id: String(rec.customerId) },
        select,
      })
    }

    // 照合: メール → 電話 → 名前（lreach と同じ優先順位）
    const email = String(rec.email || '').trim().toLowerCase()
    const phone = String(rec.phone || '').replace(/[\s\-]/g, '').trim()
    const name = String(rec.name || '').trim()

    if (!customer && email) {
      customer = await prisma.customer.findFirst({ where: { email }, select })
    }
    if (!customer && phone) {
      customer = await prisma.customer.findFirst({ where: { phone }, select })
    }
    if (!customer && name) {
      customer = await prisma.customer.findFirst({
        where: { name },
        orderBy: { registeredAt: 'desc' },
        select,
      })
    }

    if (!customer) {
      notMatched++
      results.push({ name: rec.name || '', matched: false })
      continue
    }

    const content = String(rec.content || '').trim()
    if (!content) {
      skipped++
      continue
    }

    const date = rec.date ? new Date(rec.date) : new Date()

    // 2) 重複チェック（元ファイルIDのマーカーで判定）
    if (rec.sourceFileId) {
      const dup = await prisma.history.findFirst({
        where: {
          customerId: customer.id,
          content: { contains: `#src:${rec.sourceFileId}` },
        },
        select: { id: true },
      })
      if (dup) {
        skipped++
        results.push({ name: customer.name, matched: true, duplicate: true })
        continue
      }
    }

    // 3) 議事録を History として作成（末尾に元ファイルIDのマーカーを埋め込み）
    const stored = rec.sourceFileId
      ? `${content}\n\n<!-- #src:${rec.sourceFileId} -->`
      : content

    await prisma.history.create({
      data: {
        customerId: customer.id,
        name: customer.name,
        ca: rec.ca || customer.ca || '',
        date,
        type: '議事録',
        result: rec.result || '',
        content: stored,
        nextContent: rec.nextContent || '',
        nextDeadline: rec.nextDeadline ? new Date(rec.nextDeadline) : null,
        createdBy: 'Notta自動連携',
      },
    })

    // 4) 顧客の最終接触日・次回アクションを更新
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        lastContact: date,
        ...(rec.nextContent ? { nextAction: String(rec.nextContent) } : {}),
        ...(rec.nextDeadline ? { nextDeadline: new Date(rec.nextDeadline) } : {}),
      },
    })

    added++
    results.push({ name: customer.name, matched: true })
  }

  return NextResponse.json({ status: 'ok', added, skipped, notMatched, results })
}
