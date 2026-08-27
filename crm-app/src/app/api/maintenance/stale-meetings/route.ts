import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PRE_INTERVIEW_STATUSES } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/maintenance/stale-meetings
 *
 * キャンセル→再予約の過去データ修正（バックフィル）。
 * 初回面談前ステータスの顧客に残っている「予約済」の旧面談を洗い出す。
 *  - 「面談キャンセル」「リスケ調整中」の顧客 → 残っている予約済の面談すべてが対象
 *  - それ以外の面談実施前ステータスで予約済が複数ある顧客 → 最新の予約以外が対象
 *
 * デフォルトは対象一覧を返すだけでDBには書き込まない。?apply=1 で実際にキャンセルへ更新。
 * あわせて、氏名の表記ゆれ（スペース差）で重複している可能性のある顧客一覧も返す（報告のみ）。
 * CRON_SECRET が設定されていれば Authorization: Bearer <secret> または ?key=<secret> で認証。
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

  const apply = req.nextUrl.searchParams.get('apply') === '1'

  const customers = await prisma.customer.findMany({
    where: { status: { in: [...PRE_INTERVIEW_STATUSES] } },
    select: {
      id: true,
      name: true,
      status: true,
      ca: true,
      meetings: {
        select: { id: true, date: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  const targets: {
    customerId: string
    name: string
    customerStatus: string
    ca: string | null
    keep: { date: Date | null; createdAt: Date }[]
    cancel: { id: string; date: Date | null; createdAt: Date }[]
  }[] = []

  for (const c of customers) {
    const active = c.meetings.filter((m) => m.status === '予約済')
    if (active.length === 0) continue

    // createdAt昇順なので、配列の最後が最も新しく入った予約
    let stale: typeof active = []
    if (c.status === '面談キャンセル' || c.status === 'リスケ調整中') {
      stale = active
    } else if (active.length > 1) {
      stale = active.slice(0, -1)
    }
    if (stale.length === 0) continue

    const keep = active.filter((m) => !stale.includes(m))
    targets.push({
      customerId: c.id,
      name: c.name,
      customerStatus: c.status,
      ca: c.ca,
      keep: keep.map((m) => ({ date: m.date, createdAt: m.createdAt })),
      cancel: stale.map((m) => ({ id: m.id, date: m.date, createdAt: m.createdAt })),
    })
  }

  let updated = 0
  if (apply && targets.length > 0) {
    const ids = targets.flatMap((t) => t.cancel.map((m) => m.id))
    const res = await prisma.meeting.updateMany({
      where: { id: { in: ids } },
      data: { status: 'キャンセル' },
    })
    updated = res.count
  }

  // 氏名の表記ゆれ（スペースの有無）で同一人物が複数レコードになっている候補（報告のみ）
  const all = await prisma.customer.findMany({
    select: { id: true, name: true, status: true, ca: true, registeredAt: true },
  })
  const byNormalizedName = new Map<string, typeof all>()
  for (const c of all) {
    const key = c.name.replace(/[\s　]+/g, '')
    if (!key) continue
    const group = byNormalizedName.get(key) ?? []
    group.push(c)
    byNormalizedName.set(key, group)
  }
  const duplicates = [...byNormalizedName.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([normalizedName, group]) => ({ normalizedName, records: group }))

  return NextResponse.json({
    mode: apply ? 'apply' : 'report',
    staleCustomers: targets.length,
    staleMeetings: targets.reduce((n, t) => n + t.cancel.length, 0),
    updated,
    targets,
    duplicates,
  })
}
