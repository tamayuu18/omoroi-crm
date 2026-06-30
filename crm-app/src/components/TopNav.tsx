'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { Users, CheckSquare, LayoutDashboard, Briefcase, BarChart3, LogOut } from 'lucide-react'

const navItems = [
  { href: '/', label: '顧客一覧', icon: Users },
  { href: '/tasks', label: 'タスク', icon: CheckSquare },
  { href: '/jobs', label: '求人', icon: Briefcase },
  { href: '/kpi', label: 'KPI', icon: BarChart3 },
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
]

export function TopNav() {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <nav className="bg-[#1B2631] text-white shadow-lg">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center h-14 gap-6">
        <Link href="/" className="text-lg font-bold tracking-wide text-white mr-4 shrink-0">
          おもろいCRM
        </Link>

        <div className="flex items-center gap-1 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                  active
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </div>

        {session?.user && (
          <div className="flex items-center gap-3 text-sm text-white/80">
            <span className="hidden sm:block">{session.user.name}</span>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1 text-white/60 hover:text-white transition-colors"
            >
              <LogOut size={15} />
              <span className="hidden sm:block">ログアウト</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
