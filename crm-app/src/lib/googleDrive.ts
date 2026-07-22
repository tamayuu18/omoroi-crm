import { google } from 'googleapis'

/**
 * Googleサービスアカウントで Drive にアクセスするクライアント。
 * 必要な環境変数:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL         … サービスアカウントのメール
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   … 秘密鍵（改行は \n でエスケープした1行でOK）
 * Nottaフォルダをこのサービスアカウントのメールに「閲覧者」で共有しておくこと。
 */
function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!email || !key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が未設定です')
  }
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  return google.drive({ version: 'v3', auth })
}

export type DriveDoc = {
  id: string
  name: string
  createdTime: string
  modifiedTime: string
}

/** 指定フォルダ直下のGoogleドキュメント一覧を作成日時順で取得 */
export async function listNottaDocs(folderId: string): Promise<DriveDoc[]> {
  const drive = getDriveClient()
  const docs: DriveDoc[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      fields: 'nextPageToken, files(id, name, createdTime, modifiedTime)',
      orderBy: 'createdTime',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files || []) {
      if (f.id && f.name) {
        docs.push({
          id: f.id,
          name: f.name,
          createdTime: f.createdTime || '',
          modifiedTime: f.modifiedTime || '',
        })
      }
    }
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)

  return docs
}

/** Googleドキュメントをプレーンテキストとして取得 */
export async function exportDocText(fileId: string): Promise<string> {
  const drive = getDriveClient()
  const res = await drive.files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'text' },
  )
  return String(res.data || '')
}
