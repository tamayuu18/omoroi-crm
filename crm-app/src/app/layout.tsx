import type { Metadata } from 'next'
import './globals.css'
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper'
import { TopNav } from '@/components/TopNav'

export const metadata: Metadata = {
  title: 'おもろいCRM',
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
          <TopNav />
          <main className="flex-1">{children}</main>
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
