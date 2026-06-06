import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // テーブルの存在確認（接続テスト）
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, message: 'Database connected' })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
