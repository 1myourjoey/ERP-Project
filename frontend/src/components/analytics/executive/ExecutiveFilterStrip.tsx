import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FilterX } from 'lucide-react'

import type { AnalyticsOptionItem } from '../../../lib/api/analytics'
import {
  EXECUTIVE_DATE_PRESET_OPTIONS,
  getExecutiveDatePresetLabel,
  type ExecutiveDatePreset,
} from '../../../lib/analytics/executiveFilters'

interface ExecutiveFilterStripProps {
  datePreset: ExecutiveDatePreset
  funds: string[]
  fundOptions: AnalyticsOptionItem[]
  onDatePresetChange: (preset: ExecutiveDatePreset) => void
  onToggleFund: (fundValue: string) => void
  onReset: () => void
}

export default function ExecutiveFilterStrip({
  datePreset,
  funds,
  fundOptions,
  onDatePresetChange,
  onToggleFund,
  onReset,
}: ExecutiveFilterStripProps) {
  const [fundMenuOpen, setFundMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!fundMenuOpen) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setFundMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFundMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [fundMenuOpen])

  return (
    <div className="rounded-xl border border-[#d8e5fb] bg-white px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#64748b]">기간</span>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {EXECUTIVE_DATE_PRESET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onDatePresetChange(option.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  datePreset === option.value
                    ? 'bg-[#0f1f3d] text-white'
                    : 'border border-[#d8e5fb] bg-[#f5f9ff] text-[#64748b] hover:text-[#1a3660]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setFundMenuOpen((current) => !current)}
              className="secondary-btn btn-sm inline-flex items-center gap-1.5"
            >
              조합 {funds.length > 0 ? `${funds.length}개` : '전체'}
              <ChevronDown size={14} />
            </button>
            {fundMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-72 rounded-2xl border border-[#d8e5fb] bg-white p-3 shadow-[0_18px_40px_rgba(15,31,61,0.16)]">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#1a3660]">조합 필터</p>
                  <button
                    type="button"
                    onClick={() => setFundMenuOpen(false)}
                    className="text-[11px] font-semibold text-[#64748b] hover:text-[#1a3660]"
                  >
                    닫기
                  </button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {fundOptions.map((option) => {
                    const checked = funds.includes(option.value)
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-xs transition ${
                          checked ? 'bg-[#eef4ff] text-[#1a3660]' : 'hover:bg-[#f5f9ff] text-[#475569]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleFund(option.value)}
                        />
                        <span className="truncate">{option.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <button type="button" onClick={onReset} className="ghost-btn btn-sm inline-flex items-center gap-1.5">
            <FilterX size={14} />
            초기화
          </button>
        </div>
      </div>

      {(funds.length > 0 || datePreset !== 'all') && (
        <div className="mt-2 flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-[11px] font-semibold text-[#64748b]">적용 중</span>
          <span className="shrink-0 rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-1 text-[11px] font-semibold text-[#1a3660]">
            기간: {getExecutiveDatePresetLabel(datePreset)}
          </span>
          {funds.map((fund) => (
            <button
              key={fund}
              type="button"
              onClick={() => onToggleFund(fund)}
              className="shrink-0 rounded-full border border-[#d8e5fb] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#64748b] hover:text-[#1a3660]"
            >
              {fund} ×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
