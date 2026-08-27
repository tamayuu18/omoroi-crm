import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PRE_INTERVIEW_STATUSES } from '@/lib/db'

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getFormValue(form: any[], fieldType: string): string {
  const field = form.find((f: any) => f.field_type === fieldType)
  return field?.value ? String(field.value) : ''
}

// 氏名の表記ゆれ（スペースの有無・全角半角）を吸収して比較するための正規化
function normalizeName(name: string): string {
  return name.replace(/[\s　]+/g, '')
}

// 電話番号をハイフン等を除いた数字だけに正規化
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}

// 顧客の照合: 固有メール → 電話番号 → 氏名の順で探す。
// lreach_schedule@foresma.jp のような複数顧客共有のシステムメールでは特定できないため、
// メールは1顧客だけが持つ場合のみ使う。氏名は「松岡美穂」と「松岡 美穂」のような
// スペースの表記ゆれで照合漏れしないよう、正規化して比較する。
async function findCustomerByGuest(guestName: string, guestEmail: string, guestPhone: string) {
  if (guestEmail) {
    const emailCount = await prisma.customer.count({ where: { email: guestEmail } })
    if (emailCount === 1) {
      return prisma.customer.findFirst({ where: { email: guestEmail } })
    }
  }

  const phone = normalizePhone(guestPhone)
  if (phone) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Customer"
      WHERE regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') = ${phone}
      ORDER BY "registeredAt" DESC
      LIMIT 1`
    if (rows.length > 0) {
      return prisma.customer.findUnique({ where: { id: rows[0].id } })
    }
  }

  const name = normalizeName(guestName)
  if (name) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Customer"
      WHERE replace(replace("name", ' ', ''), '　', '') = ${name}
      ORDER BY "registeredAt" DESC
      LIMIT 1`
    if (rows.length > 0) {
      return prisma.customer.findUnique({ where: { id: rows[0].id } })
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const rawStatus = body.status
    // status: 1/"confirmed"=確定, 2/"cancelled_by_host"=ホストキャンセル, 3/"cancelled_by_guest"=ゲストキャンセル
    const status = typeof rawStatus === 'number' ? rawStatus
      : rawStatus === 'confirmed' ? 1
      : rawStatus === 'cancelled_by_host' ? 2
      : rawStatus === 'cancelled_by_guest' ? 3
      : parseInt(rawStatus, 10)
    const rawForm = body.form ?? []
    const form: any[] = typeof rawForm === 'string' ? (() => { try { return JSON.parse(rawForm) } catch { return [] } })() : Array.isArray(rawForm) ? rawForm : []
    const rawHosts = body.hosts ?? []
    const hosts: any[] = typeof rawHosts === 'string' ? (() => { try { return JSON.parse(rawHosts) } catch { return [] } })() : Array.isArray(rawHosts) ? rawHosts : []

    // Zapierからフラットフィールドで来る場合のフォールバック
    const guestName = getFormValue(form, 'guest_name') || String(body.guest_name || '')
    const guestEmail = (getFormValue(form, 'guest_email') || String(body.guest_email || '')).toLowerCase()
    const guestPhone = getFormValue(form, 'guest_phone') || getFormValue(form, 'phone_number') || String(body.guest_phone || body.phone || '')
    const rawHostName = body.host_name || body.ca_name || ''
    const caName = hosts[0]?.name ?? (Array.isArray(rawHostName) ? rawHostName[0] : String(rawHostName))
    const startDatetime = body.local_start_datetime ? new Date(body.local_start_datetime) : null
    const endDatetime = body.local_end_datetime ? new Date(body.local_end_datetime) : null
    const timerexId = String(body.id ?? '')

    if (!guestName && !guestEmail) {
      return NextResponse.json({ error: 'no guest info' }, { status: 400 })
    }

    if (status === 1) {
      // 予約確定: 顧客を upsert して面談を登録
      // 同一メールが複数顧客に使われているシステムメールかチェック
      let isSharedEmail = false
      if (guestEmail) {
        const emailCount = await prisma.customer.count({ where: { email: guestEmail } })
        isSharedEmail = emailCount > 1
      }

      let customer = await findCustomerByGuest(guestName, guestEmail, guestPhone)

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            id: generateId(),
            name: guestName,
            email: isSharedEmail ? '' : guestEmail,
            phone: guestPhone || null,
            ca: caName,
            inflow: 'TimeRex',
            status: '面談予約済み',
          },
        })
      } else if (PRE_INTERVIEW_STATUSES.includes(customer.status)) {
        // 初回面談前の求職者に有効な予約は常に1件のはずなので、新しい予約確定が来たら
        // 別日時で残っている「予約済」の旧面談はキャンセル扱いにする。
        // キャンセル通知の取りこぼしや、キャンセル通知を伴わない日程変更があっても、
        // 初回面談日（キャンセル以外で最も古い面談日）が旧予約の日付のまま残らず、
        // 担当CAと合わせて新しい予約日時に更新される。
        await prisma.meeting.updateMany({
          where: {
            customerId: customer.id,
            status: '予約済',
            ...(startDatetime ? { NOT: { date: startDatetime } } : {}),
          },
          data: { status: 'キャンセル' },
        })
      }

      // 同じ日時の面談が既にあればスキップ（キャンセル済みは再予約とみなし対象外）
      const existingMeeting = await prisma.meeting.findFirst({
        where: { customerId: customer.id, date: startDatetime ?? undefined, status: { not: 'キャンセル' } },
      })

      if (!existingMeeting) {
        await prisma.meeting.create({
          data: {
            id: generateId(),
            customerId: customer.id,
            name: guestName,
            ca: caName,
            date: startDatetime,
            startTime: startDatetime ? startDatetime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : null,
            endTime: endDatetime ? endDatetime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : null,
            method: body.online_meeting_provider && body.online_meeting_provider !== 'none' ? body.online_meeting_provider : '対面',
            status: '予約済',
          },
        })

        // 顧客ステータスを面談予約済みに更新
        await prisma.customer.update({
          where: { id: customer.id },
          data: { status: '面談予約済み', ca: caName || undefined },
        })
      }

      return NextResponse.json({ status: 'ok', action: 'created', customerId: customer.id })
    } else if (status === 2 || status === 3) {
      // キャンセル: 対応する面談をキャンセルに更新
      const customer = await findCustomerByGuest(guestName, guestEmail, guestPhone)

      if (customer && startDatetime) {
        const cancelled = await prisma.meeting.updateMany({
          where: { customerId: customer.id, date: startDatetime },
          data: { status: 'キャンセル' },
        })

        // 予約済の面談が残っていなければ顧客ステータスも「面談キャンセル」へ更新する
        // （面談実施後のステータスまで進んでいる顧客は変更しない）
        if (cancelled.count > 0 && customer.status === '面談予約済み') {
          const remaining = await prisma.meeting.count({
            where: { customerId: customer.id, status: '予約済' },
          })
          if (remaining === 0) {
            await prisma.customer.update({
              where: { id: customer.id },
              data: { status: '面談キャンセル' },
            })
          }
        }
      }

      return NextResponse.json({ status: 'ok', action: 'cancelled' })
    }

    return NextResponse.json({ status: 'ok', action: 'ignored' })
  } catch (error) {
    console.error('TimeRex webhook error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
