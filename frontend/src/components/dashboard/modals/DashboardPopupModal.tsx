import { memo, useMemo } from 'react'

import type {
  ActiveWorkflow,
  MissingDocument,
  Task,
  UpcomingReport,
} from '../../../lib/api'
import { labelStatus } from '../../../lib/labels'
import {
  categoryBadgeClass,
  dueBadge,
  formatShortDate,
  groupByCategory,
  groupTasksByDeadline,
  safeFormatDate,
  type PopupSection,
} from '../dashboardUtils'

interface DashboardPopupModalProps {
  popupSection: PopupSection
  title: string
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  activeWorkflows: ActiveWorkflow[]
  missingDocuments: MissingDocument[]
  upcomingReports: UpcomingReport[]
  completedTodayTasks: Task[]
  onClose: () => void
  onOpenTask: (task: Task, editable?: boolean) => void
  onOpenWorkflow: (workflow: ActiveWorkflow) => void
  onNavigateInvestment: (investmentId: number) => void
  onNavigateReport: (report: UpcomingReport) => void
  onUndoComplete: (taskId: number) => void
}

function DashboardPopupModal({
  popupSection,
  title,
  todayTasks,
  tomorrowTasks,
  thisWeekTasks,
  activeWorkflows,
  missingDocuments,
  upcomingReports,
  completedTodayTasks,
  onClose,
  onOpenTask,
  onOpenWorkflow,
  onNavigateInvestment,
  onNavigateReport,
  onUndoComplete,
}: DashboardPopupModalProps) {
  const groupedToday = useMemo(() => Array.from(groupByCategory(todayTasks).entries()), [todayTasks])
  const groupedTomorrow = useMemo(() => Array.from(groupByCategory(tomorrowTasks).entries()), [tomorrowTasks])
  const groupedThisWeekByDeadline = useMemo(() => groupTasksByDeadline(thisWeekTasks), [thisWeekTasks])
  const groupedWorkflows = useMemo(() => {
    const grouped = new Map<string, ActiveWorkflow[]>()
    for (const workflow of activeWorkflows) {
      const key = workflow.fund_name || '미지정'
      const list = grouped.get(key) || []
      list.push(workflow)
      grouped.set(key, list)
    }
    return Array.from(grouped.entries())
  }, [activeWorkflows])
  const groupedDocuments = useMemo(() => {
    const grouped = new Map<string, MissingDocument[]>()
    for (const document of missingDocuments) {
      const key = document.fund_name || '미지정'
      const list = grouped.get(key) || []
      list.push(document)
      grouped.set(key, list)
    }
    return Array.from(grouped.entries())
  }, [missingDocuments])
  const sortedReports = useMemo(
    () => [...upcomingReports].sort((a, b) => (a.days_remaining ?? 999) - (b.days_remaining ?? 999)),
    [upcomingReports],
  )
  const groupedCompleted = useMemo(
    () => Array.from(groupByCategory(completedTodayTasks).entries()),
    [completedTodayTasks],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>

        <div className="space-y-2">
          {popupSection === 'today' &&
            groupedToday.map(([category, tasks]) => (
              <div key={category} className="mb-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className={categoryBadgeClass(category)}>{category}</span>
                  <span className="text-[10px] text-gray-400">{tasks.length}건</span>
                </div>
                <div className="space-y-1">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onOpenTask(task, true)}
                      className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-800">{task.title}</p>
                      {task.deadline && <p className="mt-0.5 text-xs text-gray-400">{formatShortDate(task.deadline)}</p>}
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {popupSection === 'tomorrow' &&
            groupedTomorrow.map(([category, tasks]) => (
              <div key={category} className="mb-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className={categoryBadgeClass(category)}>{category}</span>
                  <span className="text-[10px] text-gray-400">{tasks.length}건</span>
                </div>
                <div className="space-y-1">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onOpenTask(task, true)}
                      className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-800">{task.title}</p>
                      {task.deadline && <p className="mt-0.5 text-xs text-gray-400">{formatShortDate(task.deadline)}</p>}
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {popupSection === 'this_week' &&
            groupedThisWeekByDeadline.map(([dateKey, tasks]) => (
              <div key={dateKey} className="mb-3">
                <p className="mb-1 text-xs font-semibold text-gray-600">
                  {dateKey === '기한 미지정' ? dateKey : safeFormatDate(dateKey)}
                </p>
                <div className="space-y-1">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onOpenTask(task, true)}
                      className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-800">{task.title}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {popupSection === 'workflows' &&
            groupedWorkflows.map(([fundName, workflows]) => (
              <div key={fundName} className="mb-3">
                <p className="mb-1 text-xs font-semibold text-gray-600">{fundName}</p>
                <div className="space-y-1">
                  {workflows.map((workflow) => (
                    <button
                      key={workflow.id}
                      onClick={() => {
                        onClose()
                        onOpenWorkflow(workflow)
                      }}
                      className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-800">{workflow.name}</p>
                      <p className="text-xs text-gray-500">{workflow.progress}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {popupSection === 'documents' &&
            groupedDocuments.map(([fundName, documents]) => (
              <div key={fundName} className="mb-3">
                <p className="mb-1 text-xs font-semibold text-gray-600">
                  {fundName} ({documents.length}건)
                </p>
                <div className="space-y-1">
                  {documents.map((document) => (
                    <button
                      key={document.id}
                      onClick={() => onNavigateInvestment(document.investment_id)}
                      className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-left hover:bg-amber-100"
                    >
                      <p className="text-sm font-medium text-amber-900">{document.document_name}</p>
                      <p className="text-xs text-amber-700">
                        {document.company_name} | 마감 {formatShortDate(document.due_date)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {popupSection === 'reports' &&
            sortedReports.map((report) => {
              const badge = dueBadge(report.days_remaining)
              return (
                <button
                  key={report.id}
                  onClick={() => onNavigateReport(report)}
                  className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800">
                      {report.report_target} | {report.period}
                    </p>
                    {badge && <span className={badge.className}>{badge.text}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {report.fund_name || '조합 공통'} | {labelStatus(report.status)}
                  </p>
                </button>
              )
            })}

          {popupSection === 'completed' &&
            groupedCompleted.map(([category, tasks]) => (
              <div key={category} className="mb-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className={categoryBadgeClass(category)}>{category}</span>
                  <span className="text-[10px] text-gray-400">{tasks.length}건</span>
                </div>
                <div className="space-y-1">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-gray-200 p-2">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => onOpenTask(task, true)}
                          className="truncate text-left text-sm text-gray-500 line-through hover:text-blue-600"
                        >
                          {task.title}
                        </button>
                        <button
                          onClick={() => onUndoComplete(task.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          되돌리기
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

export default memo(DashboardPopupModal)
