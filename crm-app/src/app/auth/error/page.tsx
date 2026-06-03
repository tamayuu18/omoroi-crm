'use client'

import Link from 'next/link'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm text-center">
        <h1 className="text-xl font-bold text-red-600 mb-2">認証エラー</h1>
        <p className="text-gray-500 text-sm mb-6">
          ログインに失敗しました。アクセス権限があるアカウントでお試しください。
        </p>
        <Link
          href="/auth/signin"
          className="inline-block bg-[#0070D2] text-white px-6 py-2 rounded-lg hover:bg-[#005fb2] transition-colors"
        >
          ログイン画面に戻る
        </Link>
      </div>
    </div>
  )
}
