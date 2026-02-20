import { memo, useState } from 'react'

import type { FundSummary, GPEntity, TaskCreate } from '../../../lib/api'
import TimeSelect from '../../TimeSelect'
import { detectNoticeReport } from '../../../lib/taskFlags'
import { TASK_CATEGORY_OPTIONS } from '../dashboardUtils'

interface QuickTaskAddModalProps {
  defaultDate: string
  baseDate: string
  funds: FundSummary[]
  gpEntities: GPEntity[]
  defaultFundId?: number | null
  onAdd: (data: TaskCreate) => void
  onCancel: () => void
}

function QuickTaskAddModal({
  defaultDate,
  baseDate,
  funds,
  gpEntities,
  defaultFundId,
  onAdd,
  onCancel,
}: QuickTaskAddModalProps) {
  const [title, setTitle] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [category, setCategory] = useState('')
  const [relatedTarget, setRelatedTarget] = useState<string>(defaultFundId ? `fund:${defaultFundId}` : '')
  const [isNotice, setIsNotice] = useState(false)
  const [isReport, setIsReport] = useState(false)

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <h3 className="mb-1 text-lg font-semibold">빠른 업무 추가</h3>
          <p className="mb-3 text-xs text-gray-500">
            마감일: {defaultDate}
            {defaultDate !== baseDate && <span className="ml-1 text-blue-500">(내일)</span>}
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">업무 제목</label>
              <input
                autoFocus
                value={title}
                onChange={(event) => {
                  const nextTitle = event.target.value
                  setTitle(nextTitle)
                  const detected = detectNoticeReport(nextTitle)
                  setIsNotice(detected.is_notice)
                  setIsReport(detected.is_report)
                }}
                placeholder="예: 정기 보고서 작성"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={isNotice}
                  onChange={(event) => setIsNotice(event.target.checked)}
                  className="rounded border-gray-300"
                />
                통지
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={isReport}
                  onChange={(event) => setIsReport(event.target.checked)}
                  className="rounded border-gray-300"
                />
                보고
              </label>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">예상 시간</label>
              <TimeSelect value={estimatedTime} onChange={setEstimatedTime} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">카테고리</label>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="">선택</option>
                  {TASK_CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-500">관련 대상</label>
                <select
                  value={relatedTarget}
                  onChange={(event) => setRelatedTarget(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="">선택</option>
                  {gpEntities.length > 0 && (
                    <optgroup label="고유계정">
                      {gpEntities.map((entity) => (
                        <option key={`gp-${entity.id}`} value={`gp:${entity.id}`}>
                          {entity.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="조합">
                    {funds.map((fund) => (
                      <option key={`fund-${fund.id}`} value={`fund:${fund.id}`}>
                        {fund.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn">
              취소
            </button>
            <button
              onClick={() => {
                if (!title.trim()) return
                const selectedFundId = relatedTarget.startsWith('fund:') ? Number(relatedTarget.slice(5)) : null
                const selectedGpEntityId = relatedTarget.startsWith('gp:') ? Number(relatedTarget.slice(3)) : null
                onAdd({
                  title: title.trim(),
                  quadrant: 'Q1',
                  deadline: defaultDate,
                  estimated_time: estimatedTime || null,
                  category: category || null,
                  fund_id: selectedFundId || null,
                  gp_entity_id: selectedGpEntityId || null,
                  is_notice: isNotice,
                  is_report: isReport,
                })
              }}
              className="primary-btn"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default memo(QuickTaskAddModal)
