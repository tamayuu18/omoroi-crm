import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeCa } from '@/lib/ca'
import { markInterviewHeld } from '@/lib/db'
import { listNottaDocs, exportDocText } from '@/lib/googleDrive'
import {
  generateMinutes,
  guessNameFromFileName,
  loadCustomerIndex,
  matchCustomerDetailed,
} from '@/lib/meetingMinutes'
import { isDetailedMinutes } from '@/lib/minutesFormat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 秒

/**
 * GET /api/cron/notta
 *
 * Vercel Cron が Authorization: Bearer <CRON_SECRET> を付けて呼び出します。
 * 手元での動作確認用に ?key=<CRON_SECRET> でも実行できます。
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
 * 二重登録の防止は、履歴本文の末尾に埋め込む `#src:<fileId>` マーカーで行うため、
 * DBのテーブル追加は不要です。
 *
 * 未処理ドキュメントは新しい面談から順に、NOTTA_CONCURRENCY 件（既定3件）ずつ
 * 同時にAI生成して記録します。時間予算（CRON_TIME_BUDGET_MS、既定240秒）で
 * 処理しきれなかった分は次回の実行に持ち越されます。
 */
export async function GET(req: NextRequest) {
  // Vercelの実行時間上限（maxDuration=300秒）に達すると504で強制終了され、
  // レスポンスも返せなくなる。上限の少し手前で安全に打ち切り、
  // 途中経過をJSONで返す（処理済み分は保存されているので再実行で続きから進む）。
  const startedAt = Date.now()
  const timeBudgetMs = Number(process.env.CRON_TIME_BUDGET_MS || 240_000)
  const timeLeft = () => timeBudgetMs - (Date.now() - startedAt)

  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const key = req.nextUrl.searchParams.get('key') || ''
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const folderId = process.env.NOTTA_FOLDER_ID
  if (!folderId) {
    return NextResponse.json({ error: 'NOTTA_FOLDER_ID が未設定です' }, { status: 500 })
  }

  const dry = req.nextUrl.searchParams.get('dry') || ''

  let docs
  try {
    docs = await listNottaDocs(folderId)
  } catch (e: any) {
    return NextResponse.json({ error: `Drive走査に失敗: ${String(e?.message || e)}` }, { status: 500 })
  }

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
  const rewrite = req.nextUrl.searchParams.get('rewrite') || ''
  if (rewrite === '1' || rewrite === 'dry') {
    const apply = rewrite === '1'
    const sinceParam = req.nextUrl.searchParams.get('since') || ''
    const since = sinceParam ? new Date(sinceParam) : null
    if (since && Number.isNaN(since.getTime())) {
      return NextResponse.json({ error: 'since は YYYY-MM-DD 形式で指定してください' }, { status: 400 })
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

      // AI生成は1件あたり1分前後かかるため、余裕を持って打ち切る
      if (timeLeft() < 90_000) {
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
        const ex = await generateMinutes(file, text)
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
      } catch (e: any) {
        errored++
        details.push({ file, customer: h.name, date, error: String(e?.message || e).slice(0, 500) })
      }
    }

    return NextResponse.json({
      status: apply ? (timeLimited ? 'rewrite-partial' : 'rewrite') : 'rewrite-dry',
      対象履歴: histories.length,
      [apply ? 'updated' : '作り直し対象']: updated,
      alreadyOk,
      skipped: skippedCount,
      errored,
      ...(timeLimited ? { note: '時間制限のため途中で終了しました。再実行すると続きから処理します。' } : {}),
      details,
    })
  }

  // 取り込み済みのファイルIDを、既存履歴のマーカーから収集（1クエリ）。
  // 議事録本文をすべて取得すると毎日の実行で全議事録が転送されてしまうため、
  // マーカー部分（#src:<fileId>）だけをDB側で抜き出して受け取る。
  const done = new Set<string>()
  const past = await prisma.$queryRaw<{ fileId: string }[]>`
    SELECT (regexp_matches("content", '#src:([A-Za-z0-9_-]+)', 'g'))[1] AS "fileId"
    FROM "History"
    WHERE "createdBy" = 'Notta自動連携' AND "content" LIKE '%#src:%'
  `
  for (const h of past) done.add(h.fileId)

  const index = await loadCustomerIndex()

  let added = 0
  let notMatched = 0
  let skipped = 0
  let errored = 0
  const details: any[] = []

  // 未処理ドキュメントを先に仕分けする（AI・本文取得なしの軽い処理）。
  //   primary  … ファイル名で顧客が特定できたもの。最優先で記録する。
  //   deferred … ファイル名に氏名が無いもの（「Google Meetからの新しいノート」等）。
  //              本文からのAI照合が必要で時間がかかるため、残り時間で処理する。
  // ファイル名に氏名があるのに該当者がいないものは、ここで未照合として報告のみ。
  // 以前は作成日順に全件を順番に処理していたため、照合できない古いファイルの
  // AI処理に時間を使い切り、新しい面談に処理が届かず記録漏れが起きていた。
  type Target = { doc: (typeof docs)[number]; customer: { id: string; name: string; ca: string | null } | null; by: string }
  const primary: Target[] = []
  const deferred: Target[] = []

  for (const doc of docs) {
    if (done.has(doc.id)) {
      skipped++
      continue
    }
    const guessed = guessNameFromFileName(doc.name)
    if (!guessed) {
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

  // 新しい面談から順に処理する。1回の実行で処理しきれない日があっても、
  // 前日の面談が古い未処理分の後回しにされて記録されない、という事態を防ぐ。
  // （以前は作成日の古い順だったため、未処理分が溜まると前日の議事録が何日も入らなかった）
  const byNewest = (a: Target, b: Target) => (b.doc.createdTime || '').localeCompare(a.doc.createdTime || '')
  primary.sort(byNewest)
  deferred.sort(byNewest)
  const targets = [...primary, ...deferred]
  let processed = 0
  let timeLimited = false

  // 詳細議事録のAI生成は1件あたり1分前後かかるため、1件ずつ直列に処理すると
  // 時間予算（既定240秒）の中で3件程度しか記録できず、1日の面談数がそれを
  // 超えると記録漏れが起きていた。複数件を同時に生成して処理件数を増やす。
  const concurrency = Math.max(1, Number(process.env.NOTTA_CONCURRENCY || 3))
  let cursor = 0

  const processOne = async (t: Target) => {
    const doc = t.doc

    try {
      let customer = t.customer
      let by = t.by

      const text = await exportDocText(doc.id)
      if (!text.trim()) {
        skipped++
        details.push({ file: doc.name, skipped: '本文が空' })
        return
      }

      // 文字起こしから詳細議事録を生成する（Nottaの要約は参考情報として渡す）。
      // 以前はここでNottaの要約をそのまま本文にしていたため、議事録が数行の
      // 要約だけになっていた。
      const ex = await generateMinutes(doc.name, text)

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
          return
        }
        customer = post.customer
        by = post.by
      }

      const content = `${ex.minutes}\n\n<!-- #src:${doc.id} -->`

      await prisma.history.create({
        data: {
          customerId: customer.id,
          name: customer.name,
          ca: normalizeCa(customer.ca || ''),
          date: new Date(),
          type: '議事録',
          result: ex.result || '',
          content,
          nextContent: ex.nextAction || '',
          nextDeadline: ex.nextDeadline ? new Date(ex.nextDeadline) : null,
          createdBy: 'Notta自動連携',
        },
      })

      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          lastContact: new Date(),
          ...(ex.nextAction ? { nextAction: ex.nextAction } : {}),
          ...(ex.nextDeadline ? { nextDeadline: new Date(ex.nextDeadline) } : {}),
        },
      })

      // 議事録が付いた＝面談は実施済み。まだ実施前のステータスなら進める
      await markInterviewHeld(customer.id)

      done.add(doc.id)
      added++
      details.push({
        file: doc.name,
        matched: true,
        customer: customer.name,
        by,
        source: ex.source,
      })
    } catch (e: any) {
      errored++
      details.push({ file: doc.name, error: String(e?.message || e).slice(0, 500) })
    }
  }

  // 同時実行数ぶんのワーカーが、残り時間がある限り次のドキュメントを取りに行く
  const worker = async () => {
    while (cursor < targets.length) {
      // 生成に1分前後かかるため、余裕を持って新規の着手をやめる
      if (timeLeft() < 90_000) {
        timeLimited = true
        return
      }
      const t = targets[cursor++]
      processed++
      await processOne(t)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const remaining = targets.length - processed
  const summaryJson = {
    status: timeLimited ? 'partial' : 'ok',
    total: docs.length,
    added,
    notMatched,
    skipped,
    errored,
    ...(timeLimited
      ? {
          残り: remaining,
          note: `時間制限のため途中で終了しました（未処理 ${remaining} 件）。再実行すると続きから処理します。`,
        }
      : {}),
    details,
  }

  // Vercelのログで実行結果を確認できるように要点を出力する
  console.log(
    `[cron/notta] status=${summaryJson.status} total=${docs.length} added=${added} notMatched=${notMatched} skipped=${skipped} errored=${errored}${timeLimited ? ` remaining=${remaining}` : ''}`
  )
  // Cronの実行ではレスポンスJSONを誰も読まないため、記録できなかった理由もログに残す
  for (const d of details) {
    if (d.matched === false) {
      console.log(`[cron/notta] 未照合: ${d.file} / 推定した顧客名=${d.推定した顧客名 || ''}${d.note ? ` / ${d.note}` : ''}`)
    } else if (d.error) {
      console.error(`[cron/notta] エラー: ${d.file} / ${d.error}`)
    } else if (d.skipped) {
      console.log(`[cron/notta] スキップ: ${d.file} / ${d.skipped}`)
    } else if (d.matched) {
      console.log(`[cron/notta] 記録: ${d.file} → ${d.customer}（${d.by}）`)
    }
  }
  if (timeLimited) {
    console.warn(`[cron/notta] 時間制限のため未処理 ${remaining} 件: ${targets.slice(processed).map((t) => t.doc.name).join(' | ')}`)
  }

  return NextResponse.json(summaryJson)
}
