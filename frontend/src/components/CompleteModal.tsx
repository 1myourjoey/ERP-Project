import { useState } from 'react'
import { Check, X } from 'lucide-react'

import LottieAnimation from './LottieAnimation'
import TimeSelect from './TimeSelect'

interface CompleteTaskLike {
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
              disabled={!actualTime}
            >
              <Check size={16} /> 완료
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
