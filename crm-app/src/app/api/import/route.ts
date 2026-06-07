import { type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// CSV ヘッダー名 → フィールド名のマッピング
const HEADER_MAP: Record<string, string> = {
  '氏名': 'name', '名前': 'name', 'name': 'name',
  'フリガナ': 'kana', 'ふりがな': 'kana', 'kana': 'kana',
  '電話番号': 'phone', '電話': 'phone', 'phone': 'phone', 'tel': 'phone',
  'メールアドレス': 'email', 'メール': 'email', 'email': 'email',
  '年齢': 'age', 'age': 'age',
  '性別': 'gender', 'gender': 'gender',
  '居住地': 'area', '都道府県': 'area', 'area': 'area',
  '現職企業': 'company', '会社名': 'company', '企業名': 'company', 'company': 'company',
  '現職職種': 'job', '職種': 'job', 'job': 'job',
  '現在年収': 'salary', '年収': 'salary', 'salary': 'salary',
  '希望職種': 'hopeJob', 'hopeJob': 'hopeJob',
  '希望勤務地': 'hopeArea', 'hopeArea': 'hopeArea',
  '希望年収': 'hopeSalary', 'hopeSalary': 'hopeSalary',
  '転職希望時期': 'timing', '転職時期': 'timing', 'timing': 'timing',
  '担当CA': 'ca', 'CA': 'ca', '担当者': 'ca', 'ca': 'ca',
  '流入元': 'inflow', 'inflow': 'inflow',
  'ステータス': 'status', 'status': 'status',
  'ヨミランク': 'yomiRank', 'ヨミ': 'yomiRank', 'yomiRank': 'yomiRank',
  '受注予定月': 'expectedCloseMonth', 'expectedCloseMonth': 'expectedCloseMonth',
  '備考': 'note', 'メモ': 'note', 'note': 'note',
  '登録日': 'registeredAt', '送客日': 'registeredAt',
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  function parseLine(line: string): string[] {
    const result: string[] = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQuote = false
        else cur += ch
      } else {
        if (ch === '"') inQuote = true
        else if (ch === ',') { result.push(cur); cur = '' }
        else cur += ch
      }
    }
    result.push(cur)
    return result
  }

  const rawHeaders = parseLine(lines[0])
  const headers = rawHeaders.map(h => HEADER_MAP[h.trim()] ?? null)

  return lines.slice(1).map(line => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((key, i) => {
      if (key && values[i] !== undefined) row[key] = values[i].trim()
    })
    return row
  }).filter(row => row.name)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const preview = request.nextUrl.searchParams.get('preview') === '1'

  try {
    const text = await request.text()
    const rows = parseCSV(text)
    if (!rows.length) return Response.json({ error: 'no valid rows' }, { status: 400 })

    // プレビューモード: 保存せず解析結果を返す
    if (preview) {
      return Response.json({ ok: true, preview: true, rows: rows.slice(0, 50), total: rows.length })
    }

    // 同一CSVで複数行に同じメールが出る場合はシステムメールとして重複チェックから除外
    const emailCounts = new Map<string, number>()
    rows.forEach(r => { if (r.email) emailCounts.set(r.email.toLowerCase(), (emailCounts.get(r.email.toLowerCase()) ?? 0) + 1) })
    const sharedEmails = new Set([...emailCounts.entries()].filter(([, n]) => n > 1).map(([e]) => e))

    let added = 0, skipped = 0
    for (const row of rows) {
      const name = row.name
      const rawEmail = row.email?.toLowerCase() ?? ''
      // 複数行で使い回されているシステムメールは重複チェックに使わない
      const email = sharedEmails.has(rawEmail) ? '' : rawEmail
      const phone = row.phone ?? ''

      // メールか電話番号がある場合のみ重複チェック（名前だけでは弾かない）
      if (email || phone) {
        const existing = await prisma.customer.findFirst({
          where: {
            OR: [
              ...(email ? [{ email }] : []),
              ...(phone ? [{ phone }] : []),
            ],
          },
        })
        if (existing) { skipped++; continue }
      }

      const data: any = {
        name,
        kana: row.kana ?? '',
        email: rawEmail,
        phone,
        age: row.age ?? '',
        gender: row.gender ?? '',
        area: row.area ?? '',
        company: row.company ?? '',
        job: row.job ?? '',
        salary: row.salary ?? '',
        hopeJob: row.hopeJob ?? '',
        hopeArea: row.hopeArea ?? '',
        hopeSalary: row.hopeSalary ?? '',
        timing: row.timing ?? '',
        ca: row.ca ?? '',
        inflow: row.inflow ?? '',
        status: row.status ?? '初回未対応',
        yomiRank: row.yomiRank ?? null,
        expectedCloseMonth: row.expectedCloseMonth ?? null,
        note: row.note ?? '',
      }
      if (row.registeredAt) {
        try { data.registeredAt = new Date(row.registeredAt) } catch {}
      }

      await prisma.customer.create({ data })
      added++
    }

    return Response.json({ ok: true, added, skipped, total: rows.length })
  } catch (e) {
    console.error(e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
