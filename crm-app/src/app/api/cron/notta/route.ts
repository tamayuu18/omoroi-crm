import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listNottaDocs, exportDocText } from '@/lib/googleDrive'
import { generateMinutes, matchCustomer } from '@/lib/meetingMinutes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 秒

/**
 * GET /api/cron/notta
 *
 * Vercel Cron が Authorization: Bearer <CRON_SECRET> を付けて呼び出します。
 * 手元での動作確認用に ?key=<CRON_SECRET> でも実行できます。
 *
 * Nottaフォルダの未処理Googleドキュメントを走査し、議事録を生成して
 * 対応する顧客の対応履歴（History, type=議事録）に追加します。
 *
 * 二重登録の防止は、履歴本文の末尾に埋め込む `#src:<fileId>` マーカーで行うため、
 * DBのテーブル追加は不要です。
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const key = req.nextUrl.searchParams.get('key') || ''
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const folderId = process.env.NOTTA_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'NOTTA_FOLDER_ID が未設定です' }, { status: 500 })
  }

  // 動作確認用: ?dry=1 で Drive の見え方だけ確認（DBには書き込まない）
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  let docs
  try {
    docs = await listNottaDocs(folderId)
  } catch (e: any) {
    return NextResponse.json({ error: `Drive走査に失敗: ${String(e?.message || e)}` }, { status: 500 })
  }

  if (dryRun) {
    return NextResponse.json({
      status: 'dry-run',
      total: docs.length,
      files: docs.map((d) => ({ id: d.id, name: d.name, createdTime: d.createdTime })),
    })
  }

  // 取り込み済みのファイルIDを、既存履歴のマーカーから収集（1クエリ）
  const done = new Set<string>()
  const past = await prisma.history.findMany({
    where: { createdBy: 'Notta自動連携' },
    select: { content: true },
  })
  for (const h of past) {
    for (const m of (h.content || '').matchAll(/#src:([A-Za-z0-9_-]+)/g)) {
      done.add(m[1])
    }
  }

  let added = 0
  let notMatched = 0
  let skipped = 0
  let errored = 0
  const details: any[] = []

  for (const doc of docs) {
    if (done.has(doc.id)) {
      skipped++
      continue
    }

    try {
      const text = await exportDocText(doc.id)
      if (!text.trim()) {
        skipped++
        details.push({ file: doc.name, skipped: '本文が空' })
        continue
      }

      const ex = await generateMinutes(doc.name, text)
      const customer = await matchCustomer(ex, doc.name)

      if (!customer) {
        // 顧客が未登録。履歴は作らず、次回実行時に再挑戦します。
        notMatched++
        details.push({ file: doc.name, matched: false, personName: ex.personName })
        continue
      }

      const content = `${ex.minutes}\n\n<!-- #src:${doc.id} -->`

      await prisma.history.create({
        data: {
          customerId: customer.id,
          name: customer.name,
          ca: customer.ca || '',
          date: new Date(),
          type: '議事録',
          result: ex.result || '',
          content,
          nextContent: ex.nextAction || '',
          nextDeadline: ex.nextDeadline ? new Date(ex.nextDeadline) : null,
          createdBy: 'Notta自動連携',
        },
      })

      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          lastContact: new Date(),
          ...(ex.nextAction ? { nextAction: ex.nextAction } : {}),
          ...(ex.nextDeadline ? { nextDeadline: new Date(ex.nextDeadline) } : {}),
        },
      })

      done.add(doc.id)
      added++
      details.push({ file: doc.name, matched: true, customer: customer.name })
    } catch (e: any) {
      errored++
      details.push({ file: doc.name, error: String(e?.message || e).slice(0, 500) })
    }
  }

  return NextResponse.json({
    status: 'ok',
    total: docs.length,
    added,
    notMatched,
    skipped,
    errored,
    details,
  })
}
