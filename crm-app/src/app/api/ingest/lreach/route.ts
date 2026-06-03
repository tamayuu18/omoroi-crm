import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-ingest-token') || ''
  if (process.env.INGEST_SECRET && token !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const records = body.records as any[]

  if (!records?.length) return NextResponse.json({ error: 'no records' }, { status: 400 })

  let added = 0; let skipped = 0

  for (const rec of records) {
    const name = String(rec.name || '').trim()
    if (!name) { skipped++; continue }

    const phone = String(rec.phone || '').trim()
    const email = String(rec.email || '').trim().toLowerCase()

    // Duplicate check
    const existing = await prisma.customer.findFirst({
      where: {
        OR: [
          email ? { email } : undefined,
          phone ? { phone } : undefined,
          { name },
        ].filter(Boolean) as any,
      },
    })

    if (existing) { skipped++; continue }

    await prisma.customer.create({
      data: {
        name,
        kana: rec.kana || '',
        email: email || '',
        phone: phone || '',
        age: String(rec.age || ''),
        gender: rec.gender || '',
        inflow: 'Lreach',
        foresmaId: rec.foresmaId || '',
        ca: rec.ca || '',
        status: '初回未対応',
        timing: rec.timing || '',
        salary: rec.salary || '',
        hopeSalary: rec.hopeSalary || '',
        note: rec.note || '',
        registeredAt: rec.sendDate ? new Date(rec.sendDate) : new Date(),
      },
    })
    added++
  }

  return NextResponse.json({ status: 'ok', added, skipped })
}
