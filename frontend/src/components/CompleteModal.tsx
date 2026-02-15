import { useState } from 'react'
import { Check, X } from 'lucide-react'
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
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">작업 완료</h3>
            <button onClick={onCancel}>
              <X size={20} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>

          <p className="mb-1 text-sm text-gray-600">{task.title}</p>
          {task.fund_name && <p className="mb-3 text-xs text-blue-600">{task.fund_name}</p>}

          <label className="mb-1 block text-xs text-gray-500">실제 소요 시간</label>
          <TimeSelect value={actualTime} onChange={setActualTime} />

          <label className="mb-1 mt-3 block text-xs text-gray-500">메모 (업무기록 반영)</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="완료 소감, 특이사항 등"
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <label className="mb-4 mt-3 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoWorklog}
              onChange={(e) => {
                const nextValue = e.target.checked
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
            >
              <Check size={16} /> 완료
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
