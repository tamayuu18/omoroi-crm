import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Customer, Job } from '@prisma/client'
import { isDemoMode } from '@/lib/demo'
import { CA_OPTIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * GET /api/demo/seed
 *
 * デモ環境用のサンプルデータ投入。DEMO_MODE=1 のときだけ動く（それ以外は 404）。
 * 投入されるデータはすべて架空の人物・企業。
 *
 *   GET /api/demo/seed          … 顧客が0件のときだけ投入（すでにあれば何もしない）
 *   GET /api/demo/seed?reset=1  … 全テーブルを空にしてから投入し直す（デモのリセット用）
 *
 * 事前に `npm run db:push` などでテーブルを作成しておくこと。
 */

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)
const daysLater = (n: number) => new Date(Date.now() + n * DAY)
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const thisMonth = () => new Date().toISOString().slice(0, 7)
const nextMonth = () => {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 7)
}

type SeedCustomer = {
  name: string; kana: string; gender: string; age: string; area: string
  company: string; job: string; salary: string
  hopeJob: string; hopeArea: string; hopeSalary: string; timing: string
  inflow: string; status: string; yomiRank?: string
  registeredDaysAgo: number; lastContactDaysAgo?: number
  nextAction?: string; nextDeadlineDays?: number
  expectedCloseMonth?: string; expectedRevenue?: string; feeRate?: string
  note?: string
}

const CUSTOMERS: SeedCustomer[] = [
  { name: '佐藤 健太', kana: 'サトウ ケンタ', gender: '男性', age: '28', area: '東京都', company: '株式会社サンプル商事', job: '法人営業', salary: '420', hopeJob: 'IT営業', hopeArea: '東京都', hopeSalary: '500', timing: '3ヶ月以内', inflow: 'Lreach', status: '内定', yomiRank: 'A', registeredDaysAgo: 45, lastContactDaysAgo: 1, nextAction: '内定条件の確認・承諾意思のヒアリング', nextDeadlineDays: 2, expectedCloseMonth: thisMonth(), expectedRevenue: '150', feeRate: '30', note: '第一志望の企業から内定。年収面はほぼ希望どおり。' },
  { name: '鈴木 美咲', kana: 'スズキ ミサキ', gender: '女性', age: '31', area: '神奈川県', company: 'サンプル物流株式会社', job: '経理', salary: '380', hopeJob: '経理・財務', hopeArea: '東京都', hopeSalary: '450', timing: '1ヶ月以内', inflow: 'Lreach', status: '最終面接予定', yomiRank: 'B', registeredDaysAgo: 30, lastContactDaysAgo: 2, nextAction: '最終面接の対策面談', nextDeadlineDays: 3, expectedCloseMonth: nextMonth(), expectedRevenue: '135', feeRate: '30' },
  { name: '高橋 大輔', kana: 'タカハシ ダイスケ', gender: '男性', age: '35', area: '大阪府', company: 'サンプル製作所', job: '生産管理', salary: '520', hopeJob: 'SCM・購買', hopeArea: '大阪府', hopeSalary: '600', timing: '半年以内', inflow: 'リファラル', status: '書類選考中', yomiRank: 'B', registeredDaysAgo: 21, lastContactDaysAgo: 4, nextAction: '書類選考結果の確認', nextDeadlineDays: 5, expectedCloseMonth: nextMonth(), expectedRevenue: '180', feeRate: '30' },
  { name: '田中 さくら', kana: 'タナカ サクラ', gender: '女性', age: '26', area: '東京都', company: '株式会社サンプルデザイン', job: 'Webデザイナー', salary: '350', hopeJob: 'UI/UXデザイナー', hopeArea: '東京都', hopeSalary: '420', timing: 'すぐにでも', inflow: 'Lreach', status: '求人提案中', yomiRank: 'C', registeredDaysAgo: 14, lastContactDaysAgo: 3, nextAction: '提案求人への応募意思確認', nextDeadlineDays: 1 },
  { name: '伊藤 翔', kana: 'イトウ ショウ', gender: '男性', age: '24', area: '埼玉県', company: 'サンプル販売株式会社', job: '販売スタッフ', salary: '300', hopeJob: 'インサイドセールス', hopeArea: '東京都', hopeSalary: '380', timing: '3ヶ月以内', inflow: 'Lreach', status: '面談実施済み', registeredDaysAgo: 10, lastContactDaysAgo: 2, nextAction: '求人リストの送付', nextDeadlineDays: 2 },
  { name: '渡辺 由美', kana: 'ワタナベ ユミ', gender: '女性', age: '29', area: '千葉県', company: 'サンプル保険株式会社', job: '事務', salary: '330', hopeJob: '人事・採用', hopeArea: '東京都', hopeSalary: '400', timing: '1年以内', inflow: 'その他', status: '面談予約済み', registeredDaysAgo: 5, lastContactDaysAgo: 1, nextAction: '初回面談', nextDeadlineDays: 2 },
  { name: '山本 拓也', kana: 'ヤマモト タクヤ', gender: '男性', age: '33', area: '愛知県', company: '株式会社サンプル自動車部品', job: '品質保証', salary: '480', hopeJob: '品質保証', hopeArea: '愛知県', hopeSalary: '550', timing: '半年以内', inflow: 'Lreach', status: '初回連絡済み', registeredDaysAgo: 3, lastContactDaysAgo: 1, nextAction: '面談日程の調整', nextDeadlineDays: 1 },
  { name: '中村 愛', kana: 'ナカムラ アイ', gender: '女性', age: '27', area: '福岡県', company: 'サンプルカフェ', job: '店舗マネージャー', salary: '320', hopeJob: 'カスタマーサクセス', hopeArea: '福岡県', hopeSalary: '400', timing: '3ヶ月以内', inflow: 'Lreach', status: '初回未対応', registeredDaysAgo: 1, nextAction: '初回連絡（電話）', nextDeadlineDays: 0 },
  { name: '小林 誠', kana: 'コバヤシ マコト', gender: '男性', age: '40', area: '東京都', company: '株式会社サンプルシステムズ', job: 'プロジェクトマネージャー', salary: '750', hopeJob: 'PMO・IT企画', hopeArea: '東京都', hopeSalary: '850', timing: '時期未定', inflow: 'リファラル', status: '新規送客', registeredDaysAgo: 0, nextAction: '初回連絡（メール）', nextDeadlineDays: 1 },
  { name: '加藤 結衣', kana: 'カトウ ユイ', gender: '女性', age: '30', area: '北海道', company: 'サンプル観光株式会社', job: '企画', salary: '360', hopeJob: 'マーケティング', hopeArea: '東京都', hopeSalary: '450', timing: '1ヶ月以内', inflow: 'Lreach', status: '不通', registeredDaysAgo: 7, lastContactDaysAgo: 5, nextAction: '再架電（3回目）', nextDeadlineDays: 1 },
  { name: '吉田 蓮', kana: 'ヨシダ レン', gender: '男性', age: '25', area: '京都府', company: '株式会社サンプルフーズ', job: 'ルート営業', salary: '340', hopeJob: 'Webマーケティング', hopeArea: '大阪府', hopeSalary: '400', timing: 'すぐにでも', inflow: 'Lreach', status: 'リスケ調整中', registeredDaysAgo: 9, lastContactDaysAgo: 2, nextAction: '面談の再日程調整', nextDeadlineDays: 1 },
  { name: '山田 花子', kana: 'ヤマダ ハナコ', gender: '女性', age: '34', area: '兵庫県', company: 'サンプル建設株式会社', job: '施工管理', salary: '500', hopeJob: '施工管理', hopeArea: '大阪府', hopeSalary: '580', timing: '3ヶ月以内', inflow: 'Lreach', status: '承諾', yomiRank: 'A', registeredDaysAgo: 60, lastContactDaysAgo: 3, nextAction: '入社日の最終確認', nextDeadlineDays: 7, expectedCloseMonth: thisMonth(), expectedRevenue: '174', feeRate: '30' },
  { name: '佐々木 陽介', kana: 'ササキ ヨウスケ', gender: '男性', age: '38', area: '宮城県', company: '株式会社サンプル通信', job: 'ネットワークエンジニア', salary: '560', hopeJob: 'インフラエンジニア', hopeArea: '海外', hopeSalary: '650', timing: '1年以内', inflow: 'その他', status: '長期フォロー', registeredDaysAgo: 90, lastContactDaysAgo: 30, nextAction: '月次の近況確認', nextDeadlineDays: 14 },
  { name: '松本 彩', kana: 'マツモト アヤ', gender: '女性', age: '23', area: '東京都', company: 'サンプル人材株式会社', job: 'アシスタント', salary: '280', hopeJob: '営業事務', hopeArea: '東京都', hopeSalary: '330', timing: '1ヶ月以内', inflow: 'Lreach', status: '辞退', registeredDaysAgo: 40, lastContactDaysAgo: 12, note: '現職の待遇改善により転職活動を一旦停止。' },
  { name: '井上 直樹', kana: 'イノウエ ナオキ', gender: '男性', age: '45', area: '広島県', company: '株式会社サンプル機械', job: '工場長', salary: '680', hopeJob: '製造部門管理職', hopeArea: '広島県', hopeSalary: '750', timing: '半年以内', inflow: 'リファラル', status: '一次面接予定', yomiRank: 'C', registeredDaysAgo: 18, lastContactDaysAgo: 1, nextAction: '一次面接の想定質問共有', nextDeadlineDays: 2, expectedCloseMonth: nextMonth(), expectedRevenue: '225', feeRate: '30' },
]

const JOBS = [
  { company: '株式会社サンプルテック', title: 'ITソリューション営業', area: '東京都', salary: '450〜650', employment: '正社員', feeRate: '30', status: '募集中', source: 'manual', detail: 'SaaSプロダクトの法人向け提案営業。未経験歓迎、営業経験2年以上。' },
  { company: 'サンプルホールディングス株式会社', title: '経理・財務スタッフ', area: '東京都', salary: '400〜550', employment: '正社員', feeRate: '30', status: '募集中', source: 'manual', detail: '月次決算・年次決算補助。簿記2級以上。リモート可。' },
  { company: '株式会社サンプルクリエイティブ', title: 'UI/UXデザイナー', area: '東京都', salary: '400〜600', employment: '正社員', feeRate: '30', status: '募集中', source: 'manual', detail: '自社アプリのUI改善。Figma必須。' },
  { company: 'サンプル工業株式会社', title: '購買・SCM担当', area: '大阪府', salary: '500〜700', employment: '正社員', feeRate: '30', status: '募集中', source: 'manual', detail: '部材調達・在庫最適化。製造業での生産管理経験歓迎。' },
  { company: '株式会社サンプル建築', title: '建築施工管理', area: '大阪府', salary: '550〜750', employment: '正社員', feeRate: '30', status: '停止', source: 'manual', detail: '1級・2級施工管理技士歓迎。' },
  { company: 'サンプルマシナリー株式会社', title: '製造部門マネージャー', area: '広島県', salary: '700〜850', employment: '正社員', feeRate: '30', status: '募集中', source: 'manual', detail: '工場運営の統括。マネジメント経験5年以上。' },
]

export async function GET(req: NextRequest) {
  if (!isDemoMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const reset = req.nextUrl.searchParams.get('reset') === '1'

  if (reset) {
    // 依存関係の順に全削除（Customer/Job の削除で子テーブルはカスケードされる）
    await prisma.proposalNote.deleteMany()
    await prisma.jobProposal.deleteMany()
    await prisma.task.deleteMany()
    await prisma.meeting.deleteMany()
    await prisma.history.deleteMany()
    await prisma.yomi.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.job.deleteMany()
  } else {
    const existing = await prisma.customer.count()
    if (existing > 0) {
      return NextResponse.json({
        ok: true,
        seeded: false,
        message: `すでに顧客が ${existing} 件あるため投入しませんでした。作り直す場合は ?reset=1 を付けてください。`,
      })
    }
  }

  const cas = CA_OPTIONS.length > 0 ? CA_OPTIONS : ['担当A']
  const caOf = (i: number) => cas[i % cas.length]

  // 求人
  const jobs: Job[] = []
  for (const j of JOBS) {
    jobs.push(await prisma.job.create({ data: j }))
  }

  // 顧客
  const customers: Customer[] = []
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const c = CUSTOMERS[i]
    const created = await prisma.customer.create({
      data: {
        name: c.name, kana: c.kana, gender: c.gender, age: c.age, area: c.area,
        company: c.company, job: c.job, salary: c.salary,
        hopeJob: c.hopeJob, hopeArea: c.hopeArea, hopeSalary: c.hopeSalary, timing: c.timing,
        inflow: c.inflow, status: c.status, yomiRank: c.yomiRank ?? null,
        ca: caOf(i),
        phone: `090-0000-${String(1001 + i).padStart(4, '0')}`,
        email: `demo${i + 1}@example.com`,
        registeredAt: daysAgo(c.registeredDaysAgo),
        lastContact: c.lastContactDaysAgo != null ? daysAgo(c.lastContactDaysAgo) : null,
        nextAction: c.nextAction ?? null,
        nextDeadline: c.nextDeadlineDays != null ? daysLater(c.nextDeadlineDays) : null,
        expectedCloseMonth: c.expectedCloseMonth ?? null,
        expectedRevenue: c.expectedRevenue ?? null,
        feeRate: c.feeRate ?? null,
        note: c.note ?? null,
      },
    })
    customers.push(created)
  }

  const byName = (name: string) => customers.find(c => c.name === name)!
  const jobByTitle = (title: string) => jobs.find(j => j.title === title)!

  // 面談（設定・実施・予約中）
  const meetings = [
    { name: '佐藤 健太', daysAgo: 40, status: '完了', method: 'オンライン', result: 'IT営業への転向希望が明確。3社提案予定。', temp: '高' },
    { name: '鈴木 美咲', daysAgo: 25, status: '完了', method: 'オンライン', result: '経理経験を活かせる東京勤務を希望。', temp: '高' },
    { name: '高橋 大輔', daysAgo: 16, status: '完了', method: '対面', result: '購買・SCMへの職種チェンジ希望。', temp: '中' },
    { name: '田中 さくら', daysAgo: 10, status: '完了', method: 'オンライン', result: 'UI/UX志向。ポートフォリオあり。', temp: '中' },
    { name: '伊藤 翔', daysAgo: 4, status: '完了', method: '電話', result: '未経験から営業職へ。若手歓迎求人を提案予定。', temp: '中' },
    { name: '山田 花子', daysAgo: 55, status: '完了', method: '対面', result: '施工管理で大阪勤務希望。', temp: '高' },
    { name: '井上 直樹', daysAgo: 12, status: '完了', method: 'オンライン', result: '管理職ポジションで地元勤務を希望。', temp: '中' },
    { name: '渡辺 由美', daysAgo: -2, status: '予約済', method: 'オンライン', result: null, temp: null },
    { name: '吉田 蓮', daysAgo: 3, status: 'キャンセル', method: 'オンライン', result: null, temp: null },
  ]
  for (const m of meetings) {
    const c = byName(m.name)
    await prisma.meeting.create({
      data: {
        customerId: c.id, name: c.name, ca: c.ca,
        date: daysAgo(m.daysAgo), startTime: '19:00', endTime: '20:00',
        method: m.method, status: m.status, result: m.result, temp: m.temp,
      },
    })
  }

  // 求人提案（選考ファネル）
  const proposals = [
    { name: '佐藤 健太', job: 'ITソリューション営業', status: '内定', daysAgo: 35, interviewDaysAgo: 10 },
    { name: '鈴木 美咲', job: '経理・財務スタッフ', status: '面接', daysAgo: 20, interviewDaysAgo: -3 },
    { name: '高橋 大輔', job: '購買・SCM担当', status: '書類選考', daysAgo: 12 },
    { name: '田中 さくら', job: 'UI/UXデザイナー', status: '提案', daysAgo: 5 },
    { name: '田中 さくら', job: 'ITソリューション営業', status: '見送り', daysAgo: 8 },
    { name: '山田 花子', job: '建築施工管理', status: '承諾', daysAgo: 50, interviewDaysAgo: 30 },
    { name: '井上 直樹', job: '製造部門マネージャー', status: '面接', daysAgo: 10, interviewDaysAgo: -2 },
  ]
  for (const p of proposals) {
    const c = byName(p.name)
    const j = jobByTitle(p.job)
    const created = await prisma.jobProposal.create({
      data: {
        customerId: c.id, jobId: j.id, ca: c.ca, status: p.status,
        proposedAt: daysAgo(p.daysAgo),
        interviewDate: p.interviewDaysAgo != null ? daysAgo(p.interviewDaysAgo) : null,
        decidedAt: ['内定', '承諾', '辞退', '見送り'].includes(p.status) ? daysAgo(Math.max(0, p.daysAgo - 20)) : null,
      },
    })
    await prisma.proposalNote.create({
      data: { proposalId: created.id, content: `${j.company} を提案。本人の希望条件と合致。`, createdBy: c.ca },
    })
  }

  // 対応履歴
  const histories = [
    { name: '佐藤 健太', daysAgo: 44, type: '電話', result: '接続', content: '初回連絡。転職理由と希望条件をヒアリング。' },
    { name: '佐藤 健太', daysAgo: 40, type: '面談', result: '実施', content: '## 面談メモ\n- 現職は法人営業4年目\n- IT業界への転向を希望\n- 年収500万以上が条件' },
    { name: '佐藤 健太', daysAgo: 1, type: '電話', result: '接続', content: '内定通知を共有。承諾期限まで1週間。' },
    { name: '鈴木 美咲', daysAgo: 2, type: 'メール', result: '送信', content: '最終面接の日程確定と対策資料を送付。' },
    { name: '高橋 大輔', daysAgo: 4, type: '電話', result: '接続', content: '書類選考の進捗を共有。追加で2社提案予定。' },
    { name: '田中 さくら', daysAgo: 3, type: 'メール', result: '送信', content: 'UI/UXデザイナー求人を提案。応募意思を確認中。' },
    { name: '渡辺 由美', daysAgo: 1, type: '電話', result: '接続', content: '初回面談を2日後に設定。' },
    { name: '中村 愛', daysAgo: 0, type: '電話', result: '不通', content: '初回架電、不通。SMS送付済み。' },
    { name: '加藤 結衣', daysAgo: 5, type: '電話', result: '不通', content: '2回目架電、不通。' },
    { name: '山田 花子', daysAgo: 3, type: '電話', result: '接続', content: '入社日を来月1日で確定。' },
  ]
  for (const h of histories) {
    const c = byName(h.name)
    await prisma.history.create({
      data: { customerId: c.id, name: c.name, ca: c.ca, date: daysAgo(h.daysAgo), type: h.type, result: h.result, content: h.content, createdBy: c.ca },
    })
  }

  // タスク
  const tasks = [
    { name: '中村 愛', content: '初回連絡（電話）', deadline: 0, priority: '高', status: '未対応' },
    { name: '小林 誠', content: '初回連絡（メール送付）', deadline: 1, priority: '高', status: '未対応' },
    { name: '佐藤 健太', content: '内定承諾の意思確認', deadline: 2, priority: '高', status: '未対応' },
    { name: '鈴木 美咲', content: '最終面接の対策面談', deadline: 3, priority: '中', status: '未対応' },
    { name: '田中 さくら', content: '提案求人への応募意思確認', deadline: 1, priority: '中', status: '未対応' },
    { name: '加藤 結衣', content: '再架電（3回目）', deadline: -1, priority: '中', status: '未対応' },
    { name: '伊藤 翔', content: '求人リストの送付', deadline: 2, priority: '低', status: '未対応' },
    { name: '山田 花子', content: '入社書類の案内', deadline: -3, priority: '中', status: '完了' },
  ]
  for (const t of tasks) {
    const c = byName(t.name)
    await prisma.task.create({
      data: {
        customerId: c.id, name: c.name, ca: c.ca, assignee: c.ca,
        content: t.content, deadline: daysLater(t.deadline), priority: t.priority, status: t.status,
        relatedStatus: c.status, doneAt: t.status === '完了' ? daysAgo(1) : null,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    seeded: true,
    reset,
    counts: {
      customers: customers.length,
      jobs: jobs.length,
      meetings: meetings.length,
      proposals: proposals.length,
      histories: histories.length,
      tasks: tasks.length,
    },
    note: `サンプルデータを投入しました（${ymd(new Date())}）。担当CAは ${cas.join(', ')} を順番に割り当てています。`,
  })
}
