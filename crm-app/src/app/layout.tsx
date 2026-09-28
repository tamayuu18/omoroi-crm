import type { Metadata } from 'next'
import './globals.css'
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper'
import { TopNav } from '@/components/TopNav'
import { APP_NAME } from '@/lib/constants'
import { isDemoMode } from '@/lib/demo'

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'キャリアアドバイザー業務支援CRM',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col bg-gray-100">
        <SessionProviderWrapper>
          <TopNav demo={isDemoMode()} />
          <main className="flex-1">{children}</main>
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
