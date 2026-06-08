'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format, isAfter, isToday, isThisWeek, parseISO } from 'date-fns'
import { CheckSquare } from 'lucide-react'
import type { Task } from '@/types'
import { ASSIGNEE_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

function fmt(d: Date | string | null | undefined) {
  if (!d) return '—'
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy/MM/dd') } catch { return String(d) }
}

function categorizeTask(task: Task): 'overdue' | 'today' | 'week' | 'later' {
  if (!task.deadline) return 'later'
  try {
    const d = new Date(task.deadline as unknown as string)
    if (task.status === '完了') return 'later'
    if (isAfter(new Date(), d) && !isToday(d)) return 'overdue'
    if (isToday(d)) return 'today'
    if (isThisWeek(d, { weekStartsOn: 1 })) return 'week'
    return 'later'
  } catch {
    return 'later'
  }
}

const GROUP_LABELS = {
  overdue: { label: '期限超過', color: 'text-red-600 border-red-200 bg-red-50', badge: 'bg-red-100 text-red-700' },
  today: { label: '本日期限', color: 'text-orange-600 border-orange-200 bg-orange-50', badge: 'bg-orange-100 text-orange-700' },
  week: { label: '今週', color: 'text-yellow-700 border-yellow-200 bg-yellow-50', badge: 'bg-yellow-100 text-yellow-800' },
  later: { label: 'それ以降', color: 'text-gray-600 border-gray-200 bg-gray-50', badge: 'bg-gray-100 text-gray-600' },
}

export function TasksClient() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tasks')
      if (res.ok) setTasks(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function toggleStatus(task: Task) {
    const newStatus = task.status === '完了' ? '未完了' : '完了'
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  const filtered = tasks.filter((t) => {
    if (assigneeFilter && (t as any).assignee !== assigneeFilter) return false
    if (statusFilter && t.status !== statusFilter) return false
    return true
  })

  const grouped = {
    overdue: filtered.filter((t) => categorizeTask(t) === 'overdue'),
    today: filtered.filter((t) => categorizeTask(t) === 'today'),
    week: filtered.filter((t) => categorizeTask(t) === 'week'),
    later: filtered.filter((t) => categorizeTask(t) === 'later'),
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">タスク管理</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex gap-3 flex-wrap">
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">すべての作業担当者</option>
          {ASSIGNEE_OPTIONS.map((ca) => <option key={ca} value={ca}>{ca}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">すべてのステータス</option>
          <option value="未完了">未完了</option>
          <option value="完了">完了</option>
          <option value="対応中">対応中</option>
        </select>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-white rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.entries(grouped) as [keyof typeof grouped, Task[]][]).map(([group, groupTasks]) => {
            if (groupTasks.length === 0) return null
            const { label, color, badge } = GROUP_LABELS[group]
            return (
              <section key={group}>
                <div className={cn('flex items-center gap-2 px-3 py-2 rounded-t-lg border', color)}>
                  <h2 className="font-bold text-sm">{label}</h2>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badge)}>
                    {groupTasks.length}件
                  </span>
                </div>
                <div className="bg-white rounded-b-lg shadow-sm divide-y divide-gray-100">
                  {groupTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                      <button onClick={() => toggleStatus(task)} className="mt-0.5 shrink-0">
                        <CheckSquare
                          size={18}
                          className={task.status === '完了' ? 'text-green-500' : 'text-gray-300'}
                        />
                      </button>
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/customers/${task.customerId}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {task.name}
                          </Link>
                          {task.priority && (
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded',
                              task.priority === '高' ? 'bg-red-100 text-red-700'
                              : task.priority === '中' ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-600'
                            )}>
                              {task.priority}
                            </span>
                          )}
                        </div>
                        <p className={cn('mt-0.5 text-gray-700', task.status === '完了' && 'line-through text-gray-400')}>
                          {task.content}
                        </p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          <span>期限: {fmt(task.deadline)}</span>
                          <span>作業担当: {(task as any).assignee || task.ca || '—'}</span>
                          {(task as any).assignee && task.ca && (task as any).assignee !== task.ca && (
                            <span>顧客担当CA: {task.ca}</span>
                          )}
                          {task.relatedStatus && <span>関連: {task.relatedStatus}</span>}
                        </div>
                      </div>
                      <span className={cn(
                        'shrink-0 text-xs px-2 py-0.5 rounded-full',
                        task.status === '完了' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      )}>
                        {task.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
          {filtered.length === 0 && (
            <div className="bg-white rounded-lg p-12 text-center text-gray-400">
              タスクがありません
            </div>
          )}
        </div>
      )}
    </div>
  )
}
