export const dynamic = 'force-dynamic'
import { type NextRequest } from 'next/server'
import { getAppSession } from '@/lib/session'
import { parseJobPdf } from '@/lib/jobPdf'

const MAX_BYTES = 15 * 1024 * 1024

// 求人票PDF（jobuddy の「求人票」印刷PDF）を multipart/form-data の file で受け取り、
// Jobフォーム用の下書き（JobDraft）を返す。
export async function POST(request: NextRequest) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let file: File | null = null
  try {
    const form = await request.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch {
    return Response.json({ error: 'PDFファイルを添付してください' }, { status: 400 })
  }
  if (!file) return Response.json({ error: 'PDFファイルを添付してください' }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'PDFが大きすぎます（15MBまで）' }, { status: 413 })

  const data = new Uint8Array(await file.arrayBuffer())
  // 拡張子やMIMEは信用せず、先頭の %PDF シグネチャで判定する
  const head = new TextDecoder('latin1').decode(data.subarray(0, 8))
  if (!head.includes('%PDF')) return Response.json({ error: 'PDFファイルではありません' }, { status: 400 })

  try {
    const draft = await parseJobPdf(data)
    return Response.json(draft)
  } catch (e) {
    console.error('import-pdf failed', e)
    return Response.json({ error: 'PDFの読み取りに失敗しました' }, { status: 500 })
  }
}
