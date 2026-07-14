export const CA_OPTIONS = ['安井琢真', '濱野翔', '大田一輝', '岸田拓巳', '岩田珠優', '笠原拓実', '岸正平', '新彩菜', '小宮拓真', '長谷川璃空', '中野太揮']

export const ASSIGNEE_OPTIONS = [...CA_OPTIONS, 'Bo川口', 'Bo大川']

export const INFLOW_OPTIONS = ['Lreach', 'リファラル', 'その他']

export const GENDER_OPTIONS = ['男性', '女性', 'その他']

// 求人マスタの募集状況
export const JOB_STATUS_OPTIONS = ['募集中', '停止', 'クローズ']

// 求人提案のステータス（順序＝選考ファネル）
export const PROPOSAL_STATUS_OPTIONS = [
  '提案', '意思確認', '応募', '書類選考', '面接', '内定', '承諾', '辞退', '見送り',
]

// KPI集計で「選考到達」とみなす提案ステータス
export const PROPOSAL_SELECTION_STATUSES = ['応募', '書類選考', '面接', '内定', '承諾']
// KPI集計で「内定到達」とみなす提案ステータス
export const PROPOSAL_OFFER_STATUSES = ['内定', '承諾']
// KPI集計で「承諾」とみなす提案ステータス
export const PROPOSAL_ACCEPTED_STATUSES = ['承諾']

export const TIMING_OPTIONS = ['すぐにでも', '1ヶ月以内', '3ヶ月以内', '半年以内', '1年以内', '時期未定']

export const PREF_OPTIONS = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県', '海外',
]
