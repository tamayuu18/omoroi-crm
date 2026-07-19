import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calcAge, normalizeBirthDate } from '@/lib/utils'

const UPDATABLE_FIELDS = ['kana','phone','email','age','birthDate','education','gender','area','company','job',
                          'salary','hopeJob','hopeArea','hopeSalary','timing','foresmaId'] as const

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-ingest-token') || ''
  if (process.env.INGEST_SECRET && token !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const records = body.records as any[]

  if (!records?.length) return NextResponse.json({ error: 'no records' }, { status: 400 })

  let added = 0, updated = 0, skipped = 0

  for (const rec of records) {
    const name = String(rec.name || '').trim()
    if (!name) { skipped++; continue }

    const phone = String(rec.phone || '').replace(/[\s\-]/g, '').trim()
    const email = String(rec.email || '').trim().toLowerCase()
    const birthDate = normalizeBirthDate(String(rec.birthDate || ''))
    // 年齢は生年月日があれば自動算出を優先（取込時点で常に正確な満年齢になる）
    const age = calcAge(birthDate) || String(rec.age || '')

    // 照合: メール（ユニーク）→ 電話 → 名前
    let existing = null
    if (email) {
      const cnt = await prisma.customer.count({ where: { email } })
      if (cnt === 1) existing = await prisma.customer.findFirst({ where: { email } })
    }
    if (!existing && phone) {
      existing = await prisma.customer.findFirst({ where: { phone } })
    }
    if (!existing) {
      existing = await prisma.customer.findFirst({
        where: { name },
        orderBy: { registeredAt: 'desc' },
      })
    }

    if (existing) {
      // 空のフィールドだけ補完（既存データは上書きしない）
      const incoming: Record<string, string> = {
        kana: rec.kana || '',
        phone, email,
        age,
        birthDate,
        education: rec.education || '',
        gender: rec.gender || '',
        area: rec.area || '',
        company: rec.company || '',
        job: rec.job || '',
        salary: rec.salary || '',
        hopeJob: rec.hopeJob || '',
        hopeArea: rec.hopeArea || '',
        hopeSalary: rec.hopeSalary || '',
        timing: rec.timing || '',
        foresmaId: rec.foresmaId || '',
      }
      const patch: Record<string, string> = {}
      for (const field of UPDATABLE_FIELDS) {
        const cur = (existing as any)[field]
        if ((!cur || cur === '') && incoming[field]) {
          patch[field] = incoming[field]
        }
      }
      if (Object.keys(patch).length > 0) {
        await prisma.customer.update({ where: { id: existing.id }, data: patch })
        updated++
      } else {
        skipped++
      }
      continue
    }

    // 新規作成
    await prisma.customer.create({
      data: {
        name,
        kana: rec.kana || '',
        email: email || '',
        phone: phone || '',
        age,
        birthDate,
        education: rec.education || '',
        gender: rec.gender || '',
        area: rec.area || '',
        company: rec.company || '',
        job: rec.job || '',
        salary: rec.salary || '',
        hopeJob: rec.hopeJob || '',
        hopeArea: rec.hopeArea || '',
        hopeSalary: rec.hopeSalary || '',
        timing: rec.timing || '',
        inflow: 'Lreach',
        foresmaId: rec.foresmaId || '',
        ca: rec.ca || '',
        status: '初回未対応',
        note: rec.note || '',
        registeredAt: rec.sendDate ? new Date(rec.sendDate) : new Date(),
      },
    })
    added++
  }

  return NextResponse.json({ status: 'ok', added, updated, skipped })
}
