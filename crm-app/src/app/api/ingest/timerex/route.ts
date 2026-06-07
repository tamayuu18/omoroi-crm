import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getFormValue(form: any[], fieldType: string): string {
  const field = form.find((f: any) => f.field_type === fieldType)
  return field?.value ? String(field.value) : ''
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
      let customer = guestEmail
        ? await prisma.customer.findFirst({ where: { email: guestEmail } })
        : await prisma.customer.findFirst({ where: { name: guestName } })

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            id: generateId(),
            name: guestName,
            email: guestEmail,
            ca: caName,
            inflow: 'TimeRex',
            status: '面談予約済み',
          },
        })
      }

      // 同じtimerexIdの面談が既にあればスキップ
      const existingMeeting = await prisma.meeting.findFirst({
        where: { customerId: customer.id, date: startDatetime ?? undefined },
      })

      if (!existingMeeting) {
        await prisma.meeting.create({
          data: {
            id: generateId(),
            customerId: customer.id,
            name: guestName,
            ca: caName,
            date: startDatetime,
            startTime: startDatetime ? startDatetime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null,
            endTime: endDatetime ? endDatetime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null,
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
      const customer = guestEmail
        ? await prisma.customer.findFirst({ where: { email: guestEmail } })
        : await prisma.customer.findFirst({ where: { name: guestName } })

      if (customer && startDatetime) {
        await prisma.meeting.updateMany({
          where: { customerId: customer.id, date: startDatetime },
          data: { status: 'キャンセル' },
        })
      }

      return NextResponse.json({ status: 'ok', action: 'cancelled' })
    }

    return NextResponse.json({ status: 'ok', action: 'ignored' })
  } catch (error) {
    console.error('TimeRex webhook error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
