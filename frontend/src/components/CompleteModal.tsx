import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronDown, Lightbulb, X } from 'lucide-react'

import {
  attachWorkflowStepInstanceDocumentById,
  checkWorkflowStepInstanceDocumentById,
  fetchTaskCompletionCheck,
  fetchWorkLogLessonsByCategory,
  uncheckWorkflowStepInstanceDocumentById,
} from '../lib/api'
import TaskAttachmentSection from './common/TaskAttachmentSection'
import TimeSelect from './TimeSelect'

interface CompleteTaskLike {
  id: number
  title: string
  estimated_time: string | null
  fund_name?: string | null
  category?: string | null
  fund_id?: number | null
  workflow_instance_id?: number | null
  workflow_step_order?: number | null
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
  const queryClient = useQueryClient()
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
  const completionCheckQueryKey = ['task-completion-check', task.id] as const
  const toggleDocumentCheckMut = useMutation({
    mutationFn: ({ documentId, checked }: { documentId: number; checked: boolean }) =>
      checked
        ? uncheckWorkflowStepInstanceDocumentById(documentId)
        : checkWorkflowStepInstanceDocumentById(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: completionCheckQueryKey })
    },
  })
  const attachDocumentMut = useMutation({
    mutationFn: ({ documentId, file }: { documentId: number; file: File }) =>
      attachWorkflowStepInstanceDocumentById(documentId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: completionCheckQueryKey })
    },
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

  const documents = completionCheck.data?.documents ?? []
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
            <button onClick={onCancel} className="icon-btn text-slate-500 hover:text-slate-600" aria-label="닫기">
              <X size={20} />
            </button>
          </div>

          <p className="mb-1 text-sm text-slate-700">{task.title}</p>
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            {task.fund_name && <p className="text-blue-600">{task.fund_name}</p>}
            {task.category && <p className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{task.category}</p>}
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
                    <div key={lesson.id} className="rounded border border-amber-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                      <p>• {lesson.content}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
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

          {documents.length > 0 && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <div className="mb-1 flex items-center gap-1 font-semibold">
                <AlertTriangle size={14} />
                완료 전 필수 서류 확인
              </div>
              <div className="space-y-2">
                {documents.map((document) => {
                  const checkPending =
                    toggleDocumentCheckMut.isPending &&
                    toggleDocumentCheckMut.variables?.documentId === document.id
                  const attachPending =
                    attachDocumentMut.isPending &&
                    attachDocumentMut.variables?.documentId === document.id
                  return (
                    <div key={document.id} className="rounded border border-red-200 bg-white px-2 py-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">
                          {document.name}
                          {document.required ? ' (필수)' : ''}
                        </p>
                        <div className="flex items-center gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] ${
                              document.checked ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {document.checked ? '확인됨' : '미확인'}
                          </span>
                          {document.has_attachment && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">첨부됨</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <label
                          htmlFor={`complete-modal-attach-${document.id}`}
                          className={`cursor-pointer rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 ${
                            attachPending ? 'pointer-events-none opacity-60' : ''
                          }`}
                        >
                          {attachPending ? '첨부 중...' : '첨부'}
                        </label>
                        <input
                          id={`complete-modal-attach-${document.id}`}
                          type="file"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            attachDocumentMut.mutate({ documentId: document.id, file })
                            event.currentTarget.value = ''
                          }}
                        />
                        <button
                          type="button"
                          disabled={checkPending}
                          onClick={() =>
                            toggleDocumentCheckMut.mutate({
                              documentId: document.id,
                              checked: document.checked,
                            })
                          }
                          className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {checkPending ? '처리 중...' : document.checked ? '확인 해제' : '확인 완료'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {!canComplete && missingDocuments.length > 0 && (
                <p className="mt-2 text-[11px] text-red-700">
                  미확인 필수서류: {missingDocuments.join(', ')}
                </p>
              )}
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

          <div className="mb-3">
            <TaskAttachmentSection
              taskId={task.id}
              workflowInstanceId={task.workflow_instance_id}
              workflowStepOrder={task.workflow_step_order}
              readOnly
              compact
            />
          </div>

          <label className="mb-1 block text-xs text-slate-500">실제 소요 시간</label>
          <TimeSelect value={actualTime} onChange={setActualTime} />

          <label className="mb-1 mt-3 block text-xs text-slate-500">메모 (업무기록 반영)</label>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            rows={2}
            placeholder="완료 소감, 특이사항 등"
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <label className="mb-4 mt-3 flex items-center gap-2 text-sm text-slate-700">
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

