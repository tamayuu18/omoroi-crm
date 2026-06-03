export type CustomerStatus =
  | '新規送客'
  | '初回未対応'
  | '初回連絡済み'
  | '不通'
  | '面談予約済み'
  | '面談実施済み'
  | '面談キャンセル'
  | 'リスケ調整中'
  | '求人提案中'
  | '応募意思確認中'
  | '応募済み'
  | '書類選考中'
  | '一次面接予定'
  | '一次面接結果待ち'
  | '最終面接予定'
  | '最終面接結果待ち'
  | '内定'
  | '承諾'
  | '入社予定'
  | '入社済み'
  | '辞退'
  | '失注'
  | '長期フォロー'

export const ALL_STATUSES: CustomerStatus[] = [
  '新規送客',
  '初回未対応',
  '初回連絡済み',
  '不通',
  '面談予約済み',
  '面談実施済み',
  '面談キャンセル',
  'リスケ調整中',
  '求人提案中',
  '応募意思確認中',
  '応募済み',
  '書類選考中',
  '一次面接予定',
  '一次面接結果待ち',
  '最終面接予定',
  '最終面接結果待ち',
  '内定',
  '承諾',
  '入社予定',
  '入社済み',
  '辞退',
  '失注',
  '長期フォロー',
]

export interface Customer {
  id: string
  registeredAt: string
  updatedAt: string
  inflow: string
  foresmaId: string
  name: string
  kana: string
  phone: string
  email: string
  age: string
  gender: string
  area: string
  company: string
  job: string
  salary: string
  hopeJob: string
  hopeArea: string
  hopeSalary: string
  timing: string
  ca: string
  status: CustomerStatus
  yomiRank: string
  nextAction: string
  nextDeadline: string
  lastContact: string
  note: string
}

export interface Task {
  id: string
  customerId: string
  name: string
  ca: string
  content: string
  deadline: string
  status: string
  priority: string
  relatedStatus: string
  doneAt: string
  note: string
}

export interface Meeting {
  id: string
  customerId: string
  name: string
  ca: string
  date: string
  startTime: string
  endTime: string
  method: string
  status: string
  remind: string
  result: string
  temp: string
  proposal: string
  nextAction: string
  nextDeadline: string
}

export interface History {
  id: string
  customerId: string
  name: string
  ca: string
  date: string
  type: string
  result: string
  content: string
  nextContent: string
  nextDeadline: string
}
