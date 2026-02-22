import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, X } from 'lucide-react'

import { fetchTaskCompletionCheck } from '../lib/api'
import LottieAnimation from './LottieAnimation'
import TimeSelect from './TimeSelect'

interface CompleteTaskLike {
  id: number
  title: string
  estimated_time: string | null
  fund_name?: string | null
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

  const missingDocuments = completionCheck.data?.missing_documents ?? []
  const warnings = completionCheck.data?.warnings ?? []
  const canComplete = completionCheck.data?.can_complete ?? true
  const isChecking = completionCheck.isLoading || completionCheck.isFetching
  const confirmDisabled = !actualTime || isChecking || !canComplete

  return (
    <>
      <div className="modal-overlay fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="modal-content w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-emerald-700">업무 완료</h3>
            <button onClick={onCancel} className="icon-btn text-gray-400 hover:text-gray-600" aria-label="닫기">
              <X size={20} />
            </button>
          </div>

          <div className="mb-3 flex flex-col items-center rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <LottieAnimation src="/animations/success-check.lottie" className="h-16 w-16" loop={false} />
            <p className="mt-1 text-sm font-medium text-emerald-700">좋은 결과를 만들고 있습니다.</p>
          </div>

          <p className="mb-1 text-sm text-gray-700">{task.title}</p>
          {task.fund_name && <p className="mb-3 text-xs text-blue-600">{task.fund_name}</p>}

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
