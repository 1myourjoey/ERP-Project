import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronDown, Lightbulb, X } from 'lucide-react'

import { fetchTaskCompletionCheck, fetchWorkLogLessonsByCategory } from '../lib/api'
import TimeSelect from './TimeSelect'

interface CompleteTaskLike {
  id: number
  title: string
  estimated_time: string | null
  fund_name?: string | null
  category?: string | null
  fund_id?: number | null
}

interface CompleteModalProps {
  task: CompleteTaskLike
  onConfirm: (actualTime: string, autoWorklog: boolean, memo?: string) => void
  onCancel: () => void
  storageKey?: string
}

export default function CompleteModal({
  task,
  onConfirm,
  onCancel,
  storageKey = 'autoWorklog',
}: CompleteModalProps) {
  const [actualTime, setActualTime] = useState(task.estimated_time || '')
  const [memo, setMemo] = useState('')
  const [showLessons, setShowLessons] = useState(true)
  const [autoWorklog, setAutoWorklog] = useState(() => {
    const saved = window.localStorage.getItem(storageKey)
    return saved == null ? true : saved === 'true'
  })

  const completionCheck = useQuery({
    queryKey: ['task-completion-check', task.id],
    queryFn: () => fetchTaskCompletionCheck(task.id),
    enabled: Number.isFinite(task.id) && task.id > 0,
    staleTime: 0,
  })

  const normalizedCategory = (task.category || '').trim()
  const lessonQuery = useQuery({
    queryKey: ['worklog-lessons', normalizedCategory, task.fund_id ?? null, 5],
    queryFn: () =>
      fetchWorkLogLessonsByCategory({
        category: normalizedCategory,
        fund_id: task.fund_id ?? undefined,
        limit: 5,
      }),
    enabled: normalizedCategory.length > 0,
    staleTime: 30_000,
  })

  const missingDocuments = completionCheck.data?.missing_documents ?? []
  const warnings = completionCheck.data?.warnings ?? []
  const canComplete = completionCheck.data?.can_complete ?? true
  const isChecking = completionCheck.isLoading || completionCheck.isFetching
  const confirmDisabled = !actualTime || isChecking || !canComplete

  return (
    <>
      <div className="modal-overlay fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="modal-content w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-emerald-700">✅ 업무 완료</h3>
            <button onClick={onCancel} className="icon-btn text-gray-400 hover:text-gray-600" aria-label="닫기">
              <X size={20} />
            </button>
          </div>

          <p className="mb-1 text-sm text-gray-700">{task.title}</p>
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            {task.fund_name && <p className="text-blue-600">{task.fund_name}</p>}
            {task.category && <p className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{task.category}</p>}
          </div>

          <div className="mb-3 overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
            <button
              type="button"
              onClick={() => setShowLessons((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900">
                <Lightbulb size={14} />
                과거 교훈 리마인드
              </span>
              <ChevronDown size={14} className={`text-amber-700 transition-transform ${showLessons ? 'rotate-180' : ''}`} />
            </button>
            {showLessons && (
              <div className="space-y-1 border-t border-amber-200 px-3 py-2">
                {normalizedCategory.length === 0 ? (
                  <p className="text-xs text-amber-800">카테고리가 지정되지 않아 교훈을 불러올 수 없습니다.</p>
                ) : lessonQuery.isLoading ? (
                  <p className="text-xs text-amber-800">교훈을 불러오는 중입니다...</p>
                ) : lessonQuery.isError ? (
                  <p className="text-xs text-amber-800">교훈 조회에 실패했습니다.</p>
                ) : (lessonQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-amber-800">참고할 과거 교훈이 없습니다.</p>
                ) : (
                  lessonQuery.data!.map((lesson) => (
                    <div key={lesson.id} className="rounded border border-amber-200 bg-white px-2 py-1.5 text-xs text-gray-700">
                      <p>• {lesson.content}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {lesson.is_same_fund ? '같은 조합' : '다른 조합'}
                        {lesson.fund_name ? ` · ${lesson.fund_name}` : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {isChecking && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              완료 전 필수 조건을 확인하는 중입니다...
            </div>
          )}

          {completionCheck.isError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              완료 조건 검증에 실패했습니다. 잠시 후 다시 시도해주세요.
            </div>
          )}

          {missingDocuments.length > 0 && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <div className="mb-1 flex items-center gap-1 font-semibold">
                <AlertTriangle size={14} />
                필수 서류 미첨부
              </div>
              <ul className="space-y-0.5">
                {missingDocuments.map((documentName) => (
                  <li key={documentName}>• {documentName}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <div className="mb-1 flex items-center gap-1 font-semibold">
                <AlertTriangle size={14} />
                확인 필요
              </div>
              <ul className="space-y-0.5">
                {warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          <label className="mb-1 block text-xs text-gray-500">실제 소요 시간</label>
          <TimeSelect value={actualTime} onChange={setActualTime} />

          <label className="mb-1 mt-3 block text-xs text-gray-500">메모 (업무기록 반영)</label>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            rows={2}
            placeholder="완료 소감, 특이사항 등"
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <label className="mb-4 mt-3 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoWorklog}
              onChange={(event) => {
                const nextValue = event.target.checked
                setAutoWorklog(nextValue)
                window.localStorage.setItem(storageKey, String(nextValue))
              }}
            />
            업무 기록 자동 생성
          </label>

          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn">취소</button>
            <button
              onClick={() => actualTime && onConfirm(actualTime, autoWorklog, memo)}
              className="primary-btn inline-flex items-center gap-1"
              disabled={confirmDisabled}
            >
              <Check size={16} /> 완료
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
