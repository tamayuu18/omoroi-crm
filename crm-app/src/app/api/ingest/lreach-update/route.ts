import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calcAge, normalizeBirthDate } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-ingest-token') || ''
  if (process.env.INGEST_SECRET && token !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const data = body.data as Record<string, string>
  if (!data || !data.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const name = data.name.trim()
  const phone = (data.phone || '').replace(/[\s\-]/g, '').trim()
  const email = (data.email || '').toLowerCase().trim()

  // 照合: メール（ユニーク）→ 電話 → 名前 の優先順位
  let customer = null

  if (email) {
    const emailCount = await prisma.customer.count({ where: { email } })
    if (emailCount === 1) customer = await prisma.customer.findFirst({ where: { email } })
  }
  if (!customer && phone) {
    customer = await prisma.customer.findFirst({ where: { phone } })
  }
  if (!customer && name) {
    customer = await prisma.customer.findFirst({
      where: { name },
      orderBy: { registeredAt: 'desc' },
    })
  }

  // 更新するフィールドのみ抽出（空文字は上書きしない）
  const updateData: Record<string, string> = {}
  const ALLOWED = ['name','kana','phone','email','age','birthDate','education','gender','area','company','job',
                   'salary','hopeJob','hopeArea','hopeSalary','timing']
  for (const key of ALLOWED) {
    if (data[key] && data[key].trim()) updateData[key] = data[key].trim()
  }
  // 生年月日を正規化し、年齢は生年月日から自動算出を優先
  if (updateData.birthDate) {
    const normalized = normalizeBirthDate(updateData.birthDate)
    if (normalized) {
      updateData.birthDate = normalized
      const age = calcAge(normalized)
      if (age) updateData.age = age
    } else {
      delete updateData.birthDate
    }
  }

  if (customer) {
    await prisma.customer.update({ where: { id: customer.id }, data: updateData })
    return NextResponse.json({ ok: true, action: 'updated', customerId: customer.id, name: customer.name })
  } else {
    // 見つからない場合は新規作成
    const created = await prisma.customer.create({
      data: {
        name,
        kana: updateData.kana || '',
        phone: updateData.phone || '',
        email: updateData.email || '',
        age: updateData.age || '',
        birthDate: updateData.birthDate || '',
        education: updateData.education || '',
        gender: updateData.gender || '',
        area: updateData.area || '',
        company: updateData.company || '',
        job: updateData.job || '',
        salary: updateData.salary || '',
        hopeJob: updateData.hopeJob || '',
        hopeArea: updateData.hopeArea || '',
        hopeSalary: updateData.hopeSalary || '',
        timing: updateData.timing || '',
        inflow: 'Lreach',
        status: '初回未対応',
      },
    })
    return NextResponse.json({ ok: true, action: 'created', customerId: created.id, name: created.name })
  }
}
