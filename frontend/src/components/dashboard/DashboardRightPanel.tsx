import { memo, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Clock, FileWarning, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import EmptyState from '../EmptyState'
import {
  fetchUpcomingNotices,
  type FundSummary,
  type MissingDocument,
  type Task,
  type UpcomingNotice,
  type UpcomingReport,
} from '../../lib/api'
import { formatKRW, labelStatus } from '../../lib/labels'
import { dueBadge, formatShortDate } from './dashboardUtils'

const RIGHT_TABS = [
  { key: 'funds', label: '조합', icon: Building2 },
  { key: 'notices', label: '통지', icon: Clock },
  { key: 'reports', label: '보고', icon: Send },
  { key: 'documents', label: '서류', icon: FileWarning },
] as const

type RightTab = typeof RIGHT_TABS[number]['key']

interface DashboardRightPanelProps {
  funds: FundSummary[]
  reports: UpcomingReport[]
  missingDocuments: MissingDocument[]
  completedTodayTasks: Task[]
  completedThisWeekTasks: Task[]
  completedLastWeekTasks: Task[]
  completedTodayCount: number
  completedThisWeekCount: number
  widgetsLoading?: boolean
  completedLoading?: boolean
  onOpenTask: (task: Task, editable?: boolean) => void
  onUndoComplete: (taskId: number) => void
}

function DashboardRightPanel({
  funds,
  reports,
  missingDocuments,
  completedTodayTasks,
  completedThisWeekTasks,
  completedLastWeekTasks,
  completedTodayCount,
  completedThisWeekCount,
  widgetsLoading = false,
  completedLoading = false,
  onOpenTask,
  onUndoComplete,
}: DashboardRightPanelProps) {
  const navigate = useNavigate()
  const [rightTab, setRightTab] = useState<RightTab>('funds')
  const [completedFilter, setCompletedFilter] = useState<'today' | 'this_week' | 'last_week'>('today')
  const { data: upcomingNotices = [], isLoading: noticesLoading } = useQuery<UpcomingNotice[]>({
    queryKey: ['dashboard-upcoming-notices', 30],
    queryFn: () => fetchUpcomingNotices(30),
    enabled: rightTab === 'notices',
    staleTime: 60_000,
  })

  const tabCount = useMemo(
    () => ({
      funds: funds.length,
      notices: upcomingNotices.length,
      reports: reports.length,
      documents: missingDocuments.length,
    }),
    [funds.length, upcomingNotices.length, reports.length, missingDocuments.length],
  )

  const filteredCompleted = useMemo(() => {
    if (completedFilter === 'today') return completedTodayTasks
    if (completedFilter === 'this_week') return completedThisWeekTasks
    return completedLastWeekTasks
  }, [completedFilter, completedLastWeekTasks, completedThisWeekTasks, completedTodayTasks])

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
        {RIGHT_TABS.map((tab) => {
          const count = tabCount[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => setRightTab(tab.key)}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${rightTab === tab.key ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <tab.icon size={13} />
              {tab.label}
              {count > 0 && (
                <span className="ml-0.5 rounded-full bg-gray-200 px-1.5 text-[10px] text-gray-600">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {rightTab === 'funds' && (
        <div className="card-base dashboard-card">
          {widgetsLoading ? (
            <p className="py-8 text-center text-sm text-gray-500">조합 목록을 불러오는 중입니다...</p>
          ) : !funds.length ? (
            <EmptyState emoji="🏦" message="등록된 조합이 없어요" className="py-8" />
          ) : (
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {funds.map((fund) => (
                <button
                  key={fund.id}
                  onClick={() => navigate(`/funds/${fund.id}`)}
                  className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                >
                  <p className="text-sm font-medium text-gray-800">{fund.name}</p>
                  <p className="text-xs text-gray-500">
                    LP {fund.lp_count} | 투자 {fund.investment_count} | 약정 {formatKRW(fund.commitment_total)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {rightTab === 'notices' && (
        <div className="card-base dashboard-card">
          {noticesLoading ? (
            <p className="py-8 text-center text-sm text-gray-500">통지 일정을 불러오는 중입니다...</p>
          ) : !upcomingNotices.length ? (
            <EmptyState emoji="🗓️" message="다가오는 통지 기한이 없어요" className="py-8" />
          ) : (
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {upcomingNotices.map((notice) => {
                const badge = dueBadge(notice.days_remaining)
                return (
                  <button
                    key={`${notice.workflow_instance_id ?? 'none'}-${notice.task_id ?? 'none'}-${notice.deadline}-${notice.notice_label}`}
                    onClick={() => {
                      if (notice.task_id) {
                        navigate('/tasks', { state: { highlightTaskId: notice.task_id } })
                        return
                      }
                      navigate('/workflows', {
                        state: notice.workflow_instance_id
                          ? { expandInstanceId: notice.workflow_instance_id }
                          : undefined,
                      })
                    }}
                    className="feed-card w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">
                        {notice.fund_name} | {notice.notice_label}
                      </p>
                      {badge && <span className={badge.className}>{badge.text}</span>}
                    </div>
                    <p className="feed-card-meta">{notice.workflow_instance_name}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">기한 {formatShortDate(notice.deadline)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {rightTab === 'reports' && (
        <div className="card-base dashboard-card">
          {widgetsLoading ? (
            <p className="py-8 text-center text-sm text-gray-500">보고 마감 목록을 불러오는 중입니다...</p>
          ) : !reports.length ? (
            <EmptyState emoji="📊" message="임박한 보고 마감이 없어요" className="py-8" />
          ) : (
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {reports.map((report) => {
                const badge = dueBadge(report.days_remaining)
                return (
                  <button
                    key={report.id}
                    onClick={() => {
                      if (report.task_id) {
                        navigate('/tasks', { state: { highlightTaskId: report.task_id } })
                        return
                      }
                      navigate('/reports', { state: { highlightId: report.id } })
                    }}
                    className="feed-card w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="feed-card-title">
                        {report.report_target} | {report.period}
                      </p>
                      {badge && <span className={badge.className}>{badge.text}</span>}
                    </div>
                    <p className="feed-card-meta">{report.fund_name || '조합 공통'} | {labelStatus(report.status)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {rightTab === 'documents' && (
        <div className="card-base dashboard-card">
          {widgetsLoading ? (
            <p className="py-8 text-center text-sm text-gray-500">미수집 서류를 불러오는 중입니다...</p>
          ) : !missingDocuments.length ? (
            <EmptyState emoji="📄" message="미수집 서류가 없어요" className="py-8" />
          ) : (
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {missingDocuments.map((doc) => {
                const badge = dueBadge(doc.days_remaining)
                return (
                  <button
                    key={doc.id}
                    onClick={() => navigate(`/investments/${doc.investment_id}`)}
                    className="feed-card w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="feed-card-title">{doc.document_name}</p>
                      {badge && <span className={badge.className}>{badge.text}</span>}
                    </div>
                    <p className="feed-card-meta">
                      {doc.fund_name} | {doc.company_name} | {labelStatus(doc.status)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">마감 {formatShortDate(doc.due_date)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="card-base dashboard-card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-emerald-700">완료 업무</h3>
          <div className="flex gap-1 rounded bg-gray-100 p-0.5 text-xs">
            {(['today', 'this_week', 'last_week'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setCompletedFilter(key)}
                className={`rounded px-2 py-1 ${completedFilter === key ? 'bg-white font-medium text-emerald-700 shadow' : 'text-gray-500'}`}
              >
                {key === 'today' ? '오늘' : key === 'this_week' ? '이번 주' : '전주'}
              </button>
            ))}
          </div>
        </div>

        <p className="mb-2 text-xs text-gray-400">오늘 {completedTodayCount}건 · 이번 주 {completedThisWeekCount}건</p>
        {completedLoading ? (
          <p className="py-6 text-center text-sm text-gray-500">완료 업무를 불러오는 중입니다...</p>
        ) : filteredCompleted.length === 0 ? (
          <EmptyState emoji="✅" message="완료된 업무가 없어요" className="py-6" />
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {filteredCompleted.map((task) => (
              <div key={task.id} className="flex items-center justify-between text-sm">
                <button
                  onClick={() => onOpenTask(task, true)}
                  className="truncate text-left text-gray-400 line-through hover:text-blue-600"
                >
                  {task.title}
                </button>
                <div className="ml-2 flex items-center gap-2">
                  {task.actual_time && <span className="text-xs text-gray-400">{task.actual_time}</span>}
                  <button
                    onClick={() => onUndoComplete(task.id)}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    되돌리기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(DashboardRightPanel)
