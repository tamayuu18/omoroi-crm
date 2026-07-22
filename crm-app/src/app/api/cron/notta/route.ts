import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listNottaDocs, exportDocText } from '@/lib/googleDrive'
import { generateMinutes, matchCustomer } from '@/lib/meetingMinutes'

// Vercel Cron から定期実行される。長めの処理を許容。
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 秒（Vercel Pro以上）

const MAX_ATTEMPTS = 3

/**
 * GET /api/cron/notta
 * Vercel Cron が Authorization: Bearer <CRON_SECRET> を付けて呼び出す。
 * Nottaフォルダの新規Googleドキュメントを走査し、議事録を生成して
 * 対応する顧客の History(type=議事録) に追加する。
 */
export async function GET(req: NextRequest) {
  // 認証（CRON_SECRET を設定していれば必須）
  const auth = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const folderId = process.env.NOTTA_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'NOTTA_FOLDER_ID が未設定です' }, { status: 500 })
  }

  let added = 0
  let notMatched = 0
  let skipped = 0
  let errored = 0
  const details: Record<string, unknown>[] = []

  let docs
  try {
    docs = await listNottaDocs(folderId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Drive走査に失敗: ${msg}` }, { status: 500 })
  }

  for (const doc of docs) {
    // 既処理判定: added/empty/unmatched は再処理しない。error は MAX_ATTEMPTS まで再試行。
    const existing = await prisma.processedFile.findUnique({ where: { fileId: doc.id } })
    if (existing) {
      const done = ['added', 'empty', 'unmatched'].includes(existing.status)
      const errCap = existing.status === 'error' && existing.attempts >= MAX_ATTEMPTS
      if (done || errCap) { skipped++; continue }
    }

    try {
      const text = await exportDocText(doc.id)
      if (!text.trim()) {
        await upsertProcessed(doc.id, doc.name, { status: 'empty' })
        skipped++
        continue
      }

      const ex = await generateMinutes(doc.name, text)
      const customer = await matchCustomer(ex, doc.name)

      if (!customer) {
        await upsertProcessed(doc.id, doc.name, { status: 'unmatched', personName: ex.personName })
        notMatched++
        details.push({ file: doc.name, matched: false, personName: ex.personName })
        continue
      }

      await prisma.history.create({
        data: {
          customerId: customer.id,
          name: customer.name,
          ca: customer.ca || '',
          date: new Date(),
          type: '議事録',
          result: ex.result || '',
          content: ex.minutes,
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

      await upsertProcessed(doc.id, doc.name, { status: 'added', customerId: customer.id, personName: ex.personName })
      added++
      details.push({ file: doc.name, matched: true, customer: customer.name })
    } catch (e) {
      const note = (e instanceof Error ? e.message : String(e)).slice(0, 500)
      await upsertProcessed(doc.id, doc.name, { status: 'error', note, incrementAttempts: true })
      errored++
      details.push({ file: doc.name, error: note })
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

async function upsertProcessed(
  fileId: string,
  fileName: string,
  opts: {
    status: string
    customerId?: string
    personName?: string
    note?: string
    incrementAttempts?: boolean
  },
) {
  const base = {
    fileName,
    status: opts.status,
    customerId: opts.customerId ?? null,
    personName: opts.personName ?? null,
    note: opts.note ?? null,
  }
  await prisma.processedFile.upsert({
    where: { fileId },
    create: { fileId, ...base, attempts: opts.incrementAttempts ? 1 : 0 },
    update: {
      ...base,
      ...(opts.incrementAttempts ? { attempts: { increment: 1 } } : {}),
    },
  })
}
