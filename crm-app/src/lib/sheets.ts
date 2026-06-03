import { google } from 'googleapis'
import type { Customer, CustomerStatus, Task, Meeting, History } from '@/types'

function getAuth() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSheetsClient() {
  const auth = getAuth()
  return google.sheets({ version: 'v4', auth })
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID ?? ''

// Sheet names
const SHEETS = {
  customers: '顧客マスタ',
  tasks: 'タスク管理',
  meetings: '面談管理',
  history: '対応履歴',
}

async function getSheetValues(range: string): Promise<string[][]> {
  if (!SPREADSHEET_ID) return []
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })
  return (res.data.values ?? []) as string[][]
}

function row2customer(row: string[]): Customer {
  return {
    id: row[0] ?? '',
    registeredAt: row[1] ?? '',
    updatedAt: row[2] ?? '',
    inflow: row[3] ?? '',
    foresmaId: row[4] ?? '',
    name: row[5] ?? '',
    kana: row[6] ?? '',
    phone: row[7] ?? '',
    email: row[8] ?? '',
    age: row[9] ?? '',
    gender: row[10] ?? '',
    area: row[11] ?? '',
    company: row[12] ?? '',
    job: row[13] ?? '',
    salary: row[14] ?? '',
    hopeJob: row[15] ?? '',
    hopeArea: row[16] ?? '',
    hopeSalary: row[17] ?? '',
    timing: row[18] ?? '',
    ca: row[19] ?? '',
    status: (row[20] ?? '初回未対応') as CustomerStatus,
    yomiRank: row[21] ?? '',
    nextAction: row[22] ?? '',
    nextDeadline: row[23] ?? '',
    lastContact: row[24] ?? '',
    note: row[25] ?? '',
  }
}

function row2task(row: string[]): Task {
  return {
    id: row[0] ?? '',
    customerId: row[1] ?? '',
    name: row[2] ?? '',
    ca: row[3] ?? '',
    content: row[4] ?? '',
    deadline: row[5] ?? '',
    status: row[6] ?? '',
    priority: row[7] ?? '',
    relatedStatus: row[8] ?? '',
    doneAt: row[9] ?? '',
    note: row[10] ?? '',
  }
}

function row2meeting(row: string[]): Meeting {
  return {
    id: row[0] ?? '',
    customerId: row[1] ?? '',
    name: row[2] ?? '',
    ca: row[3] ?? '',
    date: row[4] ?? '',
    startTime: row[5] ?? '',
    endTime: row[6] ?? '',
    method: row[7] ?? '',
    status: row[8] ?? '',
    remind: row[9] ?? '',
    result: row[10] ?? '',
    temp: row[11] ?? '',
    proposal: row[12] ?? '',
    nextAction: row[13] ?? '',
    nextDeadline: row[14] ?? '',
  }
}

function row2history(row: string[]): History {
  return {
    id: row[0] ?? '',
    customerId: row[1] ?? '',
    name: row[2] ?? '',
    ca: row[3] ?? '',
    date: row[4] ?? '',
    type: row[5] ?? '',
    result: row[6] ?? '',
    content: row[7] ?? '',
    nextContent: row[8] ?? '',
    nextDeadline: row[9] ?? '',
  }
}

export async function getCustomers(): Promise<Customer[]> {
  const rows = await getSheetValues(`${SHEETS.customers}!A2:Z`)
  return rows.filter((r) => r[0]).map(row2customer)
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const customers = await getCustomers()
  return customers.find((c) => c.id === id) ?? null
}

export async function updateCustomerStatus(id: string, status: string): Promise<void> {
  const rows = await getSheetValues(`${SHEETS.customers}!A2:A`)
  const rowIndex = rows.findIndex((r) => r[0] === id)
  if (rowIndex === -1) throw new Error('Customer not found')
  const sheetRow = rowIndex + 2 // +2 for 1-based and header row
  const sheets = getSheetsClient()
  const now = new Date().toISOString().split('T')[0]
  // Update status (col U = col 21) and updatedAt (col C = col 3)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `${SHEETS.customers}!U${sheetRow}`, values: [[status]] },
        { range: `${SHEETS.customers}!C${sheetRow}`, values: [[now]] },
      ],
    },
  })
}

export async function updateCustomerFields(
  id: string,
  fields: Partial<Customer>
): Promise<void> {
  const rows = await getSheetValues(`${SHEETS.customers}!A2:A`)
  const rowIndex = rows.findIndex((r) => r[0] === id)
  if (rowIndex === -1) throw new Error('Customer not found')
  const sheetRow = rowIndex + 2
  const sheets = getSheetsClient()
  const data: { range: string; values: string[][] }[] = []
  const colMap: Record<keyof Customer, string> = {
    id: 'A', registeredAt: 'B', updatedAt: 'C', inflow: 'D', foresmaId: 'E',
    name: 'F', kana: 'G', phone: 'H', email: 'I', age: 'J', gender: 'K',
    area: 'L', company: 'M', job: 'N', salary: 'O', hopeJob: 'P',
    hopeArea: 'Q', hopeSalary: 'R', timing: 'S', ca: 'T', status: 'U',
    yomiRank: 'V', nextAction: 'W', nextDeadline: 'X', lastContact: 'Y', note: 'Z',
  }
  for (const [key, value] of Object.entries(fields)) {
    const col = colMap[key as keyof Customer]
    if (col && value !== undefined) {
      data.push({ range: `${SHEETS.customers}!${col}${sheetRow}`, values: [[String(value)]] })
    }
  }
  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data },
    })
  }
}

export async function getTasks(customerId?: string): Promise<Task[]> {
  const rows = await getSheetValues(`${SHEETS.tasks}!A2:K`)
  const tasks = rows.filter((r) => r[0]).map(row2task)
  if (customerId) return tasks.filter((t) => t.customerId === customerId)
  return tasks
}

export async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  const rows = await getSheetValues(`${SHEETS.tasks}!A2:A`)
  const rowIndex = rows.findIndex((r) => r[0] === taskId)
  if (rowIndex === -1) throw new Error('Task not found')
  const sheetRow = rowIndex + 2
  const sheets = getSheetsClient()
  const data: { range: string; values: string[][] }[] = [
    { range: `${SHEETS.tasks}!G${sheetRow}`, values: [[status]] },
  ]
  if (status === '完了') {
    const now = new Date().toISOString().split('T')[0]
    data.push({ range: `${SHEETS.tasks}!J${sheetRow}`, values: [[now]] })
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: 'RAW', data },
  })
}

export async function getMeetings(customerId?: string): Promise<Meeting[]> {
  const rows = await getSheetValues(`${SHEETS.meetings}!A2:O`)
  const meetings = rows.filter((r) => r[0]).map(row2meeting)
  if (customerId) return meetings.filter((m) => m.customerId === customerId)
  return meetings
}

export async function getHistory(customerId: string): Promise<History[]> {
  const rows = await getSheetValues(`${SHEETS.history}!A2:J`)
  return rows.filter((r) => r[1] === customerId).map(row2history)
}

export async function addHistory(entry: Omit<History, 'id'>): Promise<void> {
  const rows = await getSheetValues(`${SHEETS.history}!A2:A`)
  const newId = `H${Date.now()}`
  const sheets = getSheetsClient()
  const newRow = [
    newId,
    entry.customerId,
    entry.name,
    entry.ca,
    entry.date,
    entry.type,
    entry.result,
    entry.content,
    entry.nextContent,
    entry.nextDeadline,
  ]
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.history}!A:J`,
    valueInputOption: 'RAW',
    requestBody: { values: [newRow] },
  })
  void rows // suppress unused warning
}
