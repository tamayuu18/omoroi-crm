import crypto from 'crypto'

/**
 * Googleドライブ（サービスアカウント）へのアクセス。
 * 外部ライブラリ不要 — Node標準のcryptoでJWTを署名し、REST APIを直接叩きます。
 *
 * 必要な環境変数:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL         … サービスアカウントのメール
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   … 秘密鍵（改行が \n でエスケープされた1行でOK）
 *
 * Nottaフォルダを、このサービスアカウントのメールに「閲覧者」で共有しておくこと。
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function getCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ''
  // Vercelの環境変数に貼った際の各種エスケープを吸収
  key = key.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n')
  if (!email || !key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が未設定です')
  }
  if (!key.includes('BEGIN')) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY の形式が不正です（-----BEGIN PRIVATE KEY----- で始まる値を設定してください）')
  }
  return { email, key }
}

let cachedToken: { token: string; expiresAt: number } | null = null

/** サービスアカウントJWT → アクセストークン */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }
  const { email, key } = getCredentials()
  const now = Math.floor(Date.now() / 1000)

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signingInput = `${header}.${claims}`
  const signature = b64url(crypto.createSign('RSA-SHA256').update(signingInput).sign(key))
  const assertion = `${signingInput}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    throw new Error(`Google認証に失敗しました: ${res.status} ${await res.text()}`)
  }
  const data: any = await res.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return cachedToken.token
}

export type DriveDoc = {
  id: string
  name: string
  createdTime: string
  modifiedTime: string
}

/** 指定フォルダ直下のGoogleドキュメント一覧を作成日時順で取得 */
export async function listNottaDocs(folderId: string): Promise<DriveDoc[]> {
  const token = await getAccessToken()
  const docs: DriveDoc[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      fields: 'nextPageToken, files(id, name, createdTime, modifiedTime)',
      orderBy: 'createdTime',
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`Drive一覧の取得に失敗しました: ${res.status} ${await res.text()}`)
    }
    const data: any = await res.json()
    for (const f of data.files || []) {
      if (f.id && f.name) {
        docs.push({
          id: f.id,
          name: f.name,
          createdTime: f.createdTime || '',
          modifiedTime: f.modifiedTime || '',
        })
      }
    }
    pageToken = data.nextPageToken || undefined
  } while (pageToken)

  return docs
}

/** Googleドキュメントをプレーンテキストとして取得 */
export async function exportDocText(fileId: string): Promise<string> {
  const token = await getAccessToken()
  const params = new URLSearchParams({ mimeType: 'text/plain', supportsAllDrives: 'true' })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`本文の取得に失敗しました: ${res.status} ${await res.text()}`)
  }
  return await res.text()
}
