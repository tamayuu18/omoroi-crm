import { prisma } from '@/lib/prisma'

/**
 * 定期実行（cron）の実行記録。
 *
 * Vercel の Hobby プランではランタイムログが1時間しか残らず、夜間に動く
 * Notta連携の結果（何件取り込めたか・何がエラーだったか）を翌日に確認できない。
 * そのため実行ごとの要約を DB に残し、GET /api/cron/notta?runs=1 で参照できるようにする。
 *
 * テーブルは cron 側から毎回 CREATE TABLE IF NOT EXISTS で用意するので、
 * /api/setup を実行しなくても動く（ensureSchema からも同じ関数を呼ぶ）。
 * 記録の失敗は本来の処理を止めないよう、すべて握りつぶして console に出すだけにする。
 */

export const CRON_RUN_JOB_NOTTA = 'notta'

/** 保存する要約の上限文字数（巨大な details で行が肥大化しないように） */
const SUMMARY_MAX_CHARS = 60_000

export async function ensureCronRunTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "CronRun" (
      "id" TEXT NOT NULL,
      "job" TEXT NOT NULL,
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" TIMESTAMP(3),
      "status" TEXT,
      "summary" TEXT,
      CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
    )
  `
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "CronRun_job_startedAt_idx" ON "CronRun"("job", "startedAt")`
}

/** 実行開始を記録し、レコードIDを返す。記録できなければ null */
export async function startCronRun(job: string, note?: string): Promise<string | null> {
  try {
    await ensureCronRunTable()
    const row = await prisma.cronRun.create({
      data: { job, status: 'running', summary: note ? JSON.stringify({ note }) : null },
      select: { id: true },
    })
    return row.id
  } catch (e) {
    console.error(`[cronRun] 実行記録の開始に失敗: ${String((e as Error)?.message ?? e)}`)
    return null
  }
}

/** 実行終了を記録する（status と要約JSON）。失敗しても例外は投げない */
export async function finishCronRun(id: string | null, status: string, summary: unknown) {
  if (!id) return
  try {
    let text = JSON.stringify(summary)
    if (text.length > SUMMARY_MAX_CHARS) {
      text = JSON.stringify({ truncated: true, head: text.slice(0, SUMMARY_MAX_CHARS) })
    }
    await prisma.cronRun.update({
      where: { id },
      data: { status, finishedAt: new Date(), summary: text },
      select: { id: true },
    })
  } catch (e) {
    console.error(`[cronRun] 実行記録の保存に失敗: ${String((e as Error)?.message ?? e)}`)
  }
}

/** 直近の実行記録（新しい順）。summary は JSON に戻して返す */
export async function listCronRuns(job: string, limit = 10) {
  await ensureCronRunTable()
  const rows = await prisma.cronRun.findMany({
    where: { job },
    orderBy: { startedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
  })
  return rows.map((r) => {
    let summary: unknown = r.summary
    try {
      summary = r.summary ? JSON.parse(r.summary) : null
    } catch {
      // 壊れていても文字列のまま返す
    }
    const durationSec =
      r.finishedAt ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000) : null
    return {
      id: r.id,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      所要秒: durationSec,
      status: r.status,
      summary,
    }
  })
}
