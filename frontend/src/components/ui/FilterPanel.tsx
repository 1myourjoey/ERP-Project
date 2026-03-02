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
          <option value="">전체</option>
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
          className={`secondary-btn btn-sm ${value ? 'ring-2 ring-[var(--color-secondary)]' : ''}`}
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
        placeholder={filter.placeholder}
        className="form-input-sm"
      />
    )
  }

  const renderGrid = (items: FilterConfig[]) => (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((filter) => (
        <div key={filter.key} className="space-y-1">
          <label className="form-label text-xs">{filter.label}</label>
          {renderFilter(filter)}
        </div>
      ))}
    </div>
  )

  return (
    <div className="card-base space-y-3 p-4">
      <div className="hidden items-center justify-between md:flex">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Filter size={15} /> 필터 {activeCount > 0 ? `(${activeCount})` : ''}
        </div>
        <div className="flex items-center gap-2">
          {hidden.length > 0 && (
            <button type="button" className="ghost-btn btn-sm" onClick={() => setExpanded((prev) => !prev)}>
              필터 더보기 ({hidden.length})
            </button>
          )}
          <button type="button" className="secondary-btn btn-sm" onClick={onReset} disabled={activeCount === 0}>
            초기화
          </button>
        </div>
      </div>

      <div className="hidden md:block space-y-3">
        {renderGrid(visible)}
        {expanded && hidden.length > 0 && <div className="collapsible-enter-active">{renderGrid(hidden)}</div>}
      </div>

      <div className="md:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="secondary-btn btn-sm flex-1 inline-flex items-center justify-center gap-1"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            필터 {activeCount > 0 ? `(${activeCount})` : ''}
            <ChevronDown size={14} className={mobileOpen ? 'rotate-180' : ''} />
          </button>
          <button type="button" className="ghost-btn btn-sm" onClick={onReset} disabled={activeCount === 0}>
            초기화
          </button>
        </div>
        {mobileOpen && <div className="mt-3 space-y-3">{renderGrid(filters)}</div>}
      </div>
    </div>
  )
}

export default FilterPanel
