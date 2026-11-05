import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeCa } from '@/lib/ca'
import { markInterviewHeld } from '@/lib/db'
import { listNottaDocs, exportDocText, type DriveDoc } from '@/lib/googleDrive'
import {
  generateMinutes,
  guessNameFromFileName,
  loadCustomerIndex,
  matchCustomerDetailed,
  parseDateFromFileName,
} from '@/lib/meetingMinutes'
import { isDetailedMinutes, MINUTES_FIRST_HEADING } from '@/lib/minutesFormat'
import { CRON_RUN_JOB_NOTTA, finishCronRun, listCronRuns, startCronRun } from '@/lib/cronRun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 秒

/** エラーからメッセージ文字列を取り出す（応答・実行記録に載せる用） */
const errMsg = (e: unknown) => String((e as Error)?.message ?? e)

/**
 * GET /api/cron/notta
 *
 * Vercel Cron が Authorization: Bearer <CRON_SECRET> を付けて呼び出します。
 * 手元での動作確認用に ?key=<CRON_SECRET> でも実行できます。
 * （Vercel Hobby プランの cron は1日1回までなので、面談が多い日に追いつかせるには
 *   Apps Script の時間主導トリガーなどから同じURLを1時間ごとに呼ぶ。
 *   リポジトリ直下の nottaTrigger.gs を参照）
 *
 * Nottaフォルダの未処理Googleドキュメントを走査し、対応する顧客の
 * 対応履歴（History, type=議事録）に追加します。
 *
 * 記録する本文は、ドキュメントの文字起こしからAIで生成した詳細議事録です
 * （フォーマットは src/lib/minutesFormat.ts と docs/meeting-minutes-format.md）。
 * Nottaの要約（AI要約）は話題の抜け漏れ確認の参考として渡すだけで、
 * そのまま記録することはありません。文字起こしが無く要約だけのドキュメントは、
 * 要約の内容を落とさずに同じフォーマットへ整形します。
 *
 * 処理の順番と時間配分:
 *   - 新しい面談（ファイル名の日時が新しいもの）から順に処理します。以前は古い順だったため、
 *     未処理が溜まると直近の面談がいつまでも記録されませんでした。
 *   - 1件のAI生成は1〜3分かかります。残り時間が「直前の1件にかかった時間×1.2（最低90秒）」
 *     を切ったら次の面談には着手せず、途中経過を返します（status: partial）。
 *   - AI・Driveの各リクエストには残り時間に合わせた上限時間を付けます。以前は1件の生成が
 *     長引くと関数ごと強制終了（504）され、応答もログも残りませんでした。
 *   - ファイル名に氏名が無いドキュメント（「Google Meetからの新しいノート」等）は本文からの
 *     AI照合が必要で、照合できないものは毎日AI生成を繰り返して時間を消費していました。
 *     1回の実行で NOTTA_DEFERRED_MAX_PER_RUN 件（既定1）まで、かつ作成から
 *     NOTTA_DEFERRED_MAX_AGE_DAYS 日（既定14）以内のものだけを対象にします。
 *   - 対応履歴の日付（date）はファイル名末尾の日時（＝面談日）にします。以前は cron が
 *     動いた日になっていたため、数日遅れて取り込まれた面談が別の日付で記録されていました。
 *
 * 実行記録:
 *   毎回の結果（取り込み件数・エラー内容など）を CronRun テーブルに保存します。
 *   Vercel Hobby のログは1時間で消えるため、結果は次で確認してください。
 *   ?runs=1 … 直近の実行記録を返す（&limit=N で件数、既定10）
 *
 * 動作確認用のモード（どちらもDBには一切書き込みません）:
 *   ?dry=1 … Driveのファイル一覧だけを返す
 *   ?dry=2 … ファイル名から推定した顧客名と、CRMとの照合結果だけを返す
 *            （文字起こしの取得もAI生成も行わないので速く、費用もかかりません）
 *
 * 過去分の修正モード（以前の実行でNottaの要約のまま・文字起こしのまま記録された
 * 履歴を、新フォーマットの詳細議事録で作り直します）:
 *   ?rewrite=dry … 作り直す対象の一覧だけを返す（書き込みなし）
 *   ?rewrite=1  … 実際に作り直して上書きする
 *   &since=YYYY-MM-DD … 対応日がこの日以降の履歴だけを対象にする（省略時は全件）
 * 本文が新フォーマット（## 面談概要 で始まる）の履歴は対象外です。
 * 1件ごとにAI生成が走るため、時間制限で途中終了したら再実行してください
 * （作り直し済みの履歴は次回スキップされます）。新しい面談から順に処理します。
 *
 * 通常の実行でも、新しいドキュメントの取り込みが終わって時間が残っていれば、
 * 詳細議事録になっていない過去の履歴（文字起こしのまま・要約のまま）を
 * 新しい面談から順に自動で作り直します（1回の実行で最大 NOTTA_AUTO_REWRITE_MAX 件、
 * 既定3件。NOTTA_AUTO_REWRITE=0 で無効）。
 *
 * ANTHROPIC_API_KEY が未設定のときは何も記録しません（文字起こしをそのまま
 * 保存すると取り込み済み扱いになり、あとからAI議事録に差し替わらないため）。
 *
 * 二重登録の防止は、履歴本文の末尾に埋め込む `#src:<fileId>` マーカーで行うため、
 * 取り込み自体にDBのテーブル追加は不要です。
 */
export async function GET(req: NextRequest) {
  // Vercelの実行時間上限（maxDuration=300秒）に達すると504で強制終了され、
  // レスポンスも返せなくなる。上限の少し手前で安全に打ち切り、
  // 途中経過をJSONで返す（処理済み分は保存されているので再実行で続きから進む）。
  const startedAt = Date.now()
  const timeBudgetMs = Number(process.env.CRON_TIME_BUDGET_MS || 240_000)
  const timeLeft = () => timeBudgetMs - (Date.now() - startedAt)

  // 1件（本文取得＋AI生成）に実際にかかった最長時間。次の1件に着手するかの判断に使う。
  let longestStepMs = 0
  const MIN_STEP_MARGIN_MS = 90_000
  const canStartStep = () => timeLeft() > Math.max(MIN_STEP_MARGIN_MS, Math.round(longestStepMs * 1.2))
  // AIリクエストの上限時間。残り時間いっぱいまで待つが、応答を返す余裕（15秒）は残す
  const stepTimeoutMs = () => Math.max(30_000, Math.min(timeLeft() - 15_000, 240_000))
  const measure = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now()
    try {
      return await fn()
    } finally {
      longestStepMs = Math.max(longestStepMs, Date.now() - t0)
    }
  }

  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const key = req.nextUrl.searchParams.get('key') || ''
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // 直近の実行記録を返す（Vercelのログが消えたあとでも結果を確認できるように）
  if (req.nextUrl.searchParams.get('runs')) {
    const limit = Number(req.nextUrl.searchParams.get('limit') || 10)
    try {
      const runs = await listCronRuns(CRON_RUN_JOB_NOTTA, Number.isFinite(limit) ? limit : 10)
      return NextResponse.json({ status: 'runs', total: runs.length, runs })
    } catch (e: unknown) {
      return NextResponse.json({ error: `実行記録の取得に失敗: ${errMsg(e)}` }, { status: 500 })
    }
  }

  const folderId = process.env.NOTTA_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'NOTTA_FOLDER_ID が未設定です' }, { status: 500 })
  }

  const dry = req.nextUrl.searchParams.get('dry') || ''
  const rewrite = req.nextUrl.searchParams.get('rewrite') || ''
  // dry モードは確認用なので実行記録を残さない
  const runId = dry ? null : await startCronRun(CRON_RUN_JOB_NOTTA, rewrite ? `rewrite=${rewrite}` : undefined)
  const fail = async (status: number, body: Record<string, unknown>) => {
    await finishCronRun(runId, 'error', body)
    return NextResponse.json(body, { status })
  }

  let docs: DriveDoc[]
  try {
    docs = await listNottaDocs(folderId)
  } catch (e: unknown) {
    return fail(500, { status: 'error', error: `Drive走査に失敗: ${errMsg(e)}` })
  }
  // 新しい面談から順に処理する（ファイル名の日時 → Driveの作成日時）
  const sortKey = (d: DriveDoc) => parseDateFromFileName(d.name)?.getTime() ?? new Date(d.createdTime || 0).getTime()
  docs.sort((a, b) => sortKey(b) - sortKey(a))

  if (dry === '1') {
    return NextResponse.json({
      status: 'dry-run',
      total: docs.length,
      files: docs.map((d) => ({ id: d.id, name: d.name, createdTime: d.createdTime })),
    })
  }

  // 照合の下見。ファイル名だけを見て、誰に紐づくかを確認する。
  if (dry === '2') {
    const index = await loadCustomerIndex()
    let ok = 0
    let ng = 0
    const files: any[] = []
    for (const doc of docs) {
      const guessed = guessNameFromFileName(doc.name)
      const r = await matchCustomerDetailed(
        { personName: guessed, minutes: '' },
        doc.name,
        index
      )
      if (r.customer) ok++
      else ng++
      files.push({
        file: doc.name,
        推定した顧客名: guessed,
        面談日: parseDateFromFileName(doc.name)?.toISOString() || '',
        matched: !!r.customer,
        customer: r.customer?.name || '',
        by: r.by,
        ...(r.note ? { note: r.note } : {}),
      })
    }
    return NextResponse.json({
      status: 'dry-run-match',
      total: docs.length,
      顧客一覧の件数: index.length,
      matched: ok,
      notMatched: ng,
      files,
    })
  }

  // 過去の実行でNottaの要約のまま（または文字起こしのまま）記録された履歴を、
  // 新フォーマットの詳細議事録で作り直す。
  if (rewrite === '1' || rewrite === 'dry') {
    const apply = rewrite === '1'
    const sinceParam = req.nextUrl.searchParams.get('since') || ''
    const since = sinceParam ? new Date(sinceParam) : null
    if (since && Number.isNaN(since.getTime())) {
      return fail(400, { status: 'error', error: 'since は YYYY-MM-DD 形式で指定してください' })
    }

    const nameById = new Map(docs.map((d) => [d.id, d.name]))
    const histories = await prisma.history.findMany({
      where: {
        createdBy: 'Notta自動連携',
        content: { contains: '#src:' },
        ...(since ? { date: { gte: since } } : {}),
      },
      select: { id: true, content: true, name: true, date: true },
      orderBy: { date: 'desc' },
    })

    let updated = 0
    let alreadyOk = 0
    let skippedCount = 0
    let errored = 0
    let timeLimited = false
    const details: any[] = []

    for (const h of histories) {
      const m = (h.content || '').match(/#src:([A-Za-z0-9_-]+)/)
      if (!m) continue
      const fileId = m[1]
      const file = nameById.get(fileId) || fileId
      const date = h.date ? new Date(h.date).toISOString().slice(0, 10) : ''

      // マーカーを除いた現在の本文
      const current = (h.content || '')
        .replace(/<!--\s*#src:[A-Za-z0-9_-]+\s*-->/g, '')
        .trim()

      if (isDetailedMinutes(current)) {
        alreadyOk++
        continue
      }

      if (!apply) {
        updated++
        details.push({ file, customer: h.name, date, 現在の文字数: current.length, updated: false })
        continue
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        skippedCount++
        details.push({ file, customer: h.name, date, skipped: 'ANTHROPIC_API_KEY が未設定のため議事録を生成できません' })
        continue
      }

      // AI生成は1件あたり1〜3分かかるため、余裕を持って打ち切る
      if (!canStartStep()) {
        timeLimited = true
        break
      }

      try {
        const text = await exportDocText(fileId)
        if (!text.trim()) {
          skippedCount++
          details.push({ file, customer: h.name, date, skipped: '本文が空' })
          continue
        }
        const ex = await measure(() => generateMinutes(file, text, { timeoutMs: stepTimeoutMs() }))
        await prisma.history.update({
          where: { id: h.id },
          data: { content: `${ex.minutes}\n\n<!-- #src:${fileId} -->` },
        })
        updated++
        details.push({
          file,
          customer: h.name,
          date,
          updated: true,
          source: ex.source,
          文字数: `${current.length} → ${ex.minutes.length}`,
        })
      } catch (e: unknown) {
        errored++
        details.push({ file, customer: h.name, date, error: errMsg(e).slice(0, 500) })
      }
    }

    const body = {
      status: apply ? (timeLimited ? 'rewrite-partial' : 'rewrite') : 'rewrite-dry',
      対象履歴: histories.length,
      [apply ? 'updated' : '作り直し対象']: updated,
      alreadyOk,
      skipped: skippedCount,
      errored,
      ...(timeLimited ? { note: '時間制限のため途中で終了しました。再実行すると続きから処理します。' } : {}),
      details,
    }
    await finishCronRun(runId, body.status, body)
    return NextResponse.json(body)
  }

  // AI生成ができない状態では記録しない。以前は文字起こしをそのまま保存していたが、
  // そのファイルは取り込み済みと判定されて、キー設定後も議事録に差し替わらなかった。
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[cron/notta] ANTHROPIC_API_KEY が未設定のため、議事録の生成・記録を行いませんでした')
    return fail(500, {
      status: 'error',
      error: 'ANTHROPIC_API_KEY が未設定のため議事録を生成できません。設定後に再実行してください。',
      total: docs.length,
    })
  }

  // 取り込み済みのファイルIDを、既存履歴のマーカーから収集（1クエリ）。
  // 議事録本文をすべて取得すると毎日の実行で全議事録が転送されてしまうため、
  // マーカー部分（#src:<fileId>）だけをDB側で抜き出して受け取る。
  const done = new Set<string>()
  try {
    const past = await prisma.$queryRaw<{ fileId: string }[]>`
      SELECT (regexp_matches("content", '#src:([A-Za-z0-9_-]+)', 'g'))[1] AS "fileId"
      FROM "History"
      WHERE "createdBy" = 'Notta自動連携' AND "content" LIKE '%#src:%'
    `
    for (const h of past) done.add(h.fileId)
  } catch (e: unknown) {
    // ここで失敗すると全件が「未処理」に見えて二重登録になるため、処理を止める
    return fail(500, { status: 'error', error: `取り込み済み一覧の取得に失敗: ${errMsg(e)}` })
  }

  const index = await loadCustomerIndex()

  let added = 0
  let notMatched = 0
  let skipped = 0
  let errored = 0
  const details: any[] = []

  // 未処理ドキュメントを先に仕分けする（AI・本文取得なしの軽い処理）。
  //   primary  … ファイル名で顧客が特定できたもの。最優先で記録する。
  //   deferred … ファイル名に氏名が無いもの（「Google Meetからの新しいノート」等）。
  //              本文からのAI照合が必要で時間がかかるため、残り時間で件数を絞って処理する。
  // ファイル名に氏名があるのに該当者がいないものは、ここで未照合として報告のみ。
  type Target = { doc: DriveDoc; customer: { id: string; name: string; ca: string | null } | null; by: string }
  const primary: Target[] = []
  const deferred: Target[] = []

  const deferredMaxPerRun = Math.max(0, Number(process.env.NOTTA_DEFERRED_MAX_PER_RUN || 1))
  const deferredMaxAgeDays = Math.max(0, Number(process.env.NOTTA_DEFERRED_MAX_AGE_DAYS || 14))
  const deferredCutoff = Date.now() - deferredMaxAgeDays * 86_400_000
  let deferredSkipped = 0

  for (const doc of docs) {
    if (done.has(doc.id)) {
      skipped++
      continue
    }
    const guessed = guessNameFromFileName(doc.name)
    if (!guessed) {
      if (sortKey(doc) < deferredCutoff) {
        // 氏名の無い古いファイルは、照合できないまま毎日AI生成を繰り返さないよう対象外にする
        deferredSkipped++
        details.push({
          file: doc.name,
          skipped: `ファイル名に氏名が無く、作成から${deferredMaxAgeDays}日以上経っているため対象外（Nottaでファイル名に氏名を付けると取り込まれます）`,
        })
        continue
      }
      deferred.push({ doc, customer: null, by: '' })
      continue
    }
    const pre = await matchCustomerDetailed({ personName: guessed, minutes: '' }, doc.name, index)
    if (!pre.customer) {
      notMatched++
      details.push({
        file: doc.name,
        matched: false,
        推定した顧客名: pre.name,
        ...(pre.note ? { note: pre.note } : {}),
      })
      continue
    }
    primary.push({ doc, customer: pre.customer, by: pre.by })
  }

  const deferredThisRun = deferred.slice(0, deferredMaxPerRun)
  const deferredWaiting = deferred.length - deferredThisRun.length
  const targets = [...primary, ...deferredThisRun]
  let processed = 0
  let timeLimited = false

  for (const t of targets) {
    // 詳細議事録のAI生成は1件あたり1〜3分かかるため、直前の1件の所要時間を見て打ち切る
    if (!canStartStep()) {
      timeLimited = true
      break
    }
    const doc = t.doc
    processed++

    try {
      let customer = t.customer
      let by = t.by

      const { text, ex } = await measure(async () => {
        const text = await exportDocText(doc.id)
        if (!text.trim()) return { text, ex: null }
        // 文字起こしから詳細議事録を生成する（Nottaの要約は参考情報として渡す）。
        const ex = await generateMinutes(doc.name, text, { timeoutMs: stepTimeoutMs() })
        return { text, ex }
      })
      if (!ex) {
        skipped++
        details.push({ file: doc.name, skipped: '本文が空' })
        continue
      }
      void text

      // ファイル名に氏名が無かった場合（「Google Meetからの新しいノート」など）は、
      // 本文から拾った氏名・メール・電話で照合する。
      if (!customer) {
        const post = await matchCustomerDetailed(ex, doc.name, index)
        if (!post.customer) {
          notMatched++
          details.push({
            file: doc.name,
            matched: false,
            推定した顧客名: post.name,
            ...(post.note ? { note: post.note } : {}),
          })
          continue
        }
        customer = post.customer
        by = post.by
      }

      // 対応履歴の日付は面談日（ファイル名の日時 → Driveの作成日時 → 今）
      const meetingDate =
        parseDateFromFileName(doc.name) ?? (doc.createdTime ? new Date(doc.createdTime) : new Date())
      const content = `${ex.minutes}\n\n<!-- #src:${doc.id} -->`

      await prisma.history.create({
        data: {
          customerId: customer.id,
          name: customer.name,
          ca: normalizeCa(customer.ca || ''),
          date: meetingDate,
          type: '議事録',
          result: ex.result || '',
          content,
          nextContent: ex.nextAction || '',
          nextDeadline: ex.nextDeadline ? new Date(ex.nextDeadline) : null,
          createdBy: 'Notta自動連携',
        },
      })

      // 最終接触日は面談日で更新する（それより新しい接触が既にあれば触らない）
      await prisma.customer.updateMany({
        where: { id: customer.id, OR: [{ lastContact: null }, { lastContact: { lt: meetingDate } }] },
        data: { lastContact: meetingDate },
      })
      if (ex.nextAction || ex.nextDeadline) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            ...(ex.nextAction ? { nextAction: ex.nextAction } : {}),
            ...(ex.nextDeadline ? { nextDeadline: new Date(ex.nextDeadline) } : {}),
          },
          select: { id: true },
        })
      }

      // 議事録が付いた＝面談は実施済み。まだ実施前のステータスなら進める
      await markInterviewHeld(customer.id)

      done.add(doc.id)
      added++
      details.push({
        file: doc.name,
        matched: true,
        customer: customer.name,
        by,
        面談日: meetingDate.toISOString(),
        source: ex.source,
      })
    } catch (e: unknown) {
      errored++
      details.push({ file: doc.name, error: errMsg(e).slice(0, 500) })
    }
  }

  const remaining = targets.length - processed + deferredWaiting

  // 新しいドキュメントの取り込みが終わって時間が残っていれば、詳細議事録に
  // なっていない過去の履歴（文字起こしのまま・Notta要約のまま）を新しい面談から
  // 順に作り直す。手動の rewrite モードと同じ処理を、日次実行の余り時間で少しずつ行う。
  const autoRewrite = process.env.NOTTA_AUTO_REWRITE !== '0'
  const autoRewriteMax = Math.max(0, Number(process.env.NOTTA_AUTO_REWRITE_MAX || 3))
  let rewritten = 0
  let rewriteErrored = 0
  let rewriteRemaining = 0
  const rewriteDetails: any[] = []
  if (autoRewrite && autoRewriteMax > 0 && !timeLimited) {
    try {
      // 本文全体を転送しないよう、必要な列とマーカー部分だけをDB側で抜き出す
      const pending = await prisma.$queryRaw<
        { id: string; name: string; date: Date | null; fileId: string; len: number }[]
      >`
        SELECT "id", "name", "date",
               (regexp_matches("content", '#src:([A-Za-z0-9_-]+)'))[1] AS "fileId",
               length("content")::int AS "len"
        FROM "History"
        WHERE "createdBy" = 'Notta自動連携'
          AND "content" LIKE '%#src:%'
          AND ltrim("content") NOT LIKE ${`${MINUTES_FIRST_HEADING}%`}
        ORDER BY "date" DESC
        LIMIT ${autoRewriteMax + 1}
      `
      rewriteRemaining = pending.length
      const nameById = new Map(docs.map((d) => [d.id, d.name]))

      for (const h of pending.slice(0, autoRewriteMax)) {
        if (!canStartStep()) break
        const file = nameById.get(h.fileId) || h.fileId
        const date = h.date ? new Date(h.date).toISOString().slice(0, 10) : ''
        try {
          const text = await exportDocText(h.fileId)
          if (!text.trim()) {
            rewriteDetails.push({ file, customer: h.name, date, skipped: '本文が空' })
            continue
          }
          const ex = await measure(() => generateMinutes(file, text, { timeoutMs: stepTimeoutMs() }))
          await prisma.history.update({
            where: { id: h.id },
            data: { content: `${ex.minutes}\n\n<!-- #src:${h.fileId} -->` },
          })
          rewritten++
          rewriteRemaining--
          rewriteDetails.push({ file, customer: h.name, date, source: ex.source, 文字数: `${h.len} → ${ex.minutes.length}` })
        } catch (e: unknown) {
          rewriteErrored++
          rewriteDetails.push({ file, customer: h.name, date, error: errMsg(e).slice(0, 500) })
        }
      }
    } catch (e: unknown) {
      rewriteErrored++
      rewriteDetails.push({ error: `作り直し対象の取得に失敗: ${errMsg(e).slice(0, 500)}` })
    }
  }

  const summaryJson = {
    status: timeLimited || deferredWaiting > 0 ? 'partial' : 'ok',
    total: docs.length,
    added,
    notMatched,
    skipped,
    errored,
    ...(deferredSkipped ? { 氏名なしで対象外: deferredSkipped } : {}),
    ...(timeLimited || deferredWaiting > 0
      ? {
          残り: remaining,
          note: timeLimited
            ? `時間制限のため途中で終了しました（未処理 ${remaining} 件）。再実行すると続きから処理します。`
            : `ファイル名に氏名の無いドキュメントが ${deferredWaiting} 件残っています（1回の実行で ${deferredMaxPerRun} 件まで処理）。`,
        }
      : {}),
    所要秒: Math.round((Date.now() - startedAt) / 1000),
    details,
    ...(autoRewrite
      ? {
          過去履歴の作り直し: {
            rewritten,
            errored: rewriteErrored,
            // 作り直しがまだ必要な履歴の件数（上限+1件までしか数えないため「以上」）
            未対応: rewriteRemaining > autoRewriteMax ? `${autoRewriteMax}件以上` : rewriteRemaining,
            details: rewriteDetails,
          },
        }
      : {}),
  }

  // Vercelのログで実行結果を確認できるように要点を出力する
  console.log(
    `[cron/notta] status=${summaryJson.status} total=${docs.length} added=${added} notMatched=${notMatched} skipped=${skipped} errored=${errored}${timeLimited ? ` remaining=${remaining}` : ''} rewritten=${rewritten} rewriteErrored=${rewriteErrored} sec=${summaryJson.所要秒}`
  )
  await finishCronRun(runId, errored > 0 && added === 0 && targets.length > 0 ? 'error' : summaryJson.status, summaryJson)

  return NextResponse.json(summaryJson)
}
