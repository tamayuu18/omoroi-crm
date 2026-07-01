import { cn } from '@/lib/utils'
import type { CustomerStatus } from '@/types'

const statusColors: Record<string, string> = {
  '新規送客': 'bg-purple-100 text-purple-800',
  '初回未対応': 'bg-gray-100 text-gray-700',
  '初回連絡済み': 'bg-blue-50 text-blue-700',
  '不通': 'bg-orange-100 text-orange-700',
  '面談予約済み': 'bg-blue-100 text-blue-800',
  '面談実施済み': 'bg-green-100 text-green-800',
  '面談キャンセル': 'bg-red-100 text-red-700',
  'リスケ調整中': 'bg-yellow-100 text-yellow-800',
  '求人提案中': 'bg-cyan-100 text-cyan-800',
  '応募意思確認中': 'bg-teal-100 text-teal-800',
  '応募済み': 'bg-teal-100 text-teal-900',
  '書類選考中': 'bg-indigo-100 text-indigo-800',
  '一次面接予定': 'bg-indigo-100 text-indigo-900',
  '一次面接結果待ち': 'bg-violet-100 text-violet-800',
  '最終面接予定': 'bg-violet-100 text-violet-900',
  '最終面接結果待ち': 'bg-purple-100 text-purple-900',
  '内定': 'bg-yellow-100 text-yellow-900',
  '承諾': 'bg-amber-100 text-amber-900',
  '入社予定': 'bg-lime-100 text-lime-800',
  '入社済み': 'bg-green-100 text-green-900',
  '辞退': 'bg-red-100 text-red-800',
  '失注': 'bg-red-200 text-red-900',
  '長期フォロー': 'bg-slate-100 text-slate-700',
}

interface Props {
  status: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const color = statusColors[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span
      className={cn(
        'inline-block rounded-full font-medium whitespace-nowrap',
        color,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'
      )}
    >
      {status}
    </span>
  )
}

export function yomiRankColor(rank: string): string {
  const map: Record<string, string> = {
    'S': 'bg-red-100 text-red-800',
    'A': 'bg-orange-100 text-orange-800',
    'B': 'bg-yellow-100 text-yellow-800',
    'C': 'bg-blue-100 text-blue-800',
    'D': 'bg-gray-100 text-gray-600',
  }
  return map[rank] ?? 'bg-gray-100 text-gray-600'
}

export function YomiRankBadge({ rank }: { rank: string | null | undefined }) {
  if (!rank) return null
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-bold', yomiRankColor(rank))}>
      {rank}
    </span>
  )
}

export function TaskBadge({ hasOpenTask }: { hasOpenTask: boolean }) {
  if (!hasOpenTask) return null
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 whitespace-nowrap">
      タスクあり
    </span>
  )
}

export { statusColors }
