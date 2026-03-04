import { useMemo, useState } from 'react'
import { ChevronDown, Filter } from 'lucide-react'

export interface FilterConfig {
  key: string
  label: string
  type: 'select' | 'date' | 'text' | 'toggle'
  options?: { value: string; label: string }[]
  placeholder?: string
}

interface FilterPanelProps {
  filters: FilterConfig[]
  values: Record<string, any>
  onChange: (key: string, value: any) => void
  onReset: () => void
  visibleCount?: number
}

function isValueActive(value: any) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0 && value !== 'all'
  if (typeof value === 'boolean') return value
  return true
}

export function FilterPanel({
  filters,
  values,
  onChange,
  onReset,
  visibleCount = 3,
}: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const visible = filters.slice(0, visibleCount)
  const hidden = filters.slice(visibleCount)

  const activeCount = useMemo(
    () => filters.filter((filter) => isValueActive(values?.[filter.key])).length,
    [filters, values],
  )

  const renderFilter = (filter: FilterConfig) => {
    const value = values?.[filter.key] ?? (filter.type === 'toggle' ? false : '')

    if (filter.type === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => onChange(filter.key, event.target.value)}
          className="form-input-sm"
        >
          <option value="">{filter.placeholder || `${filter.label} 선택`}</option>
          {(filter.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    if (filter.type === 'date') {
      return (
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(filter.key, event.target.value)}
          className="form-input-sm"
        />
      )
    }

    if (filter.type === 'toggle') {
      return (
        <button
          type="button"
          className={`secondary-btn btn-sm ${value ? 'ring-2 ring-blue-300' : ''}`}
          onClick={() => onChange(filter.key, !value)}
        >
          {value ? 'ON' : 'OFF'}
        </button>
      )
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(filter.key, event.target.value)}
        placeholder={filter.placeholder || `${filter.label} 입력`}
        className="form-input-sm"
      />
    )
  }

  const renderGrid = (items: FilterConfig[]) => (
    <div className="grid gap-2 md:grid-cols-3">
      {items.map((filter) => (
        <div key={filter.key}>{renderFilter(filter)}</div>
      ))}
    </div>
  )

  return (
    <div className="space-y-2 rounded-xl border border-[#d8e5fb] bg-white px-3 py-2 shadow-sm">
      <div className="hidden items-center justify-between md:flex">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1a3660]">
          <Filter size={13} /> 필터 {activeCount > 0 ? `(${activeCount})` : ''}
        </div>
        <div className="flex items-center gap-1.5">
          {hidden.length > 0 && (
            <button type="button" className="ghost-btn btn-xs" onClick={() => setExpanded((prev) => !prev)}>
              필터 더보기 ({hidden.length})
            </button>
          )}
          <button type="button" className="secondary-btn btn-xs" onClick={onReset} disabled={activeCount === 0}>
            초기화
          </button>
        </div>
      </div>

      <div className="hidden space-y-2 md:block">
        {renderGrid(visible)}
        {expanded && hidden.length > 0 && <div className="collapsible-enter-active">{renderGrid(hidden)}</div>}
      </div>

      <div className="md:hidden">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="secondary-btn btn-sm inline-flex flex-1 items-center justify-center gap-1"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            필터 {activeCount > 0 ? `(${activeCount})` : ''}
            <ChevronDown size={14} className={mobileOpen ? 'rotate-180' : ''} />
          </button>
          <button type="button" className="ghost-btn btn-sm" onClick={onReset} disabled={activeCount === 0}>
            초기화
          </button>
        </div>
        {mobileOpen && <div className="mt-2 space-y-2">{renderGrid(filters)}</div>}
      </div>
    </div>
  )
}

export default FilterPanel
