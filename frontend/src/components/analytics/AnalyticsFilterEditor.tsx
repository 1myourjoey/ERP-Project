import { Plus, Trash2 } from 'lucide-react'

import type { AnalyticsFieldMeta, AnalyticsFilter } from '../../lib/api/analytics'
import { getAnalyticsOperatorLabel } from '../../lib/analytics/labels'

interface AnalyticsFilterEditorProps {
  fields: AnalyticsFieldMeta[]
  filters: AnalyticsFilter[]
  onChange: (filters: AnalyticsFilter[]) => void
}

export default function AnalyticsFilterEditor({ fields, filters, onChange }: AnalyticsFilterEditorProps) {
  const upsert = (index: number, patch: Partial<AnalyticsFilter>) => {
    onChange(filters.map((row, current) => (current === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[#1a3660]">필터</h4>
        <button
          type="button"
          onClick={() => onChange([...filters, { field: fields[0]?.key ?? '', op: fields[0]?.operators[0] ?? 'eq', value: '' }])}
          className="inline-flex items-center gap-1 rounded-lg border border-[#d8e5fb] bg-white px-2 py-1 text-[11px] font-semibold text-[#1a3660]"
        >
          <Plus size={12} /> 필터 추가
        </button>
      </div>

      {filters.length === 0 ? (
        <div className="rounded-xl border border-[#e4e7ee] bg-[#f7f9ff] px-3 py-3 text-xs text-[#64748b]">필터가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filters.map((filter, index) => {
            const field = fields.find((item) => item.key === filter.field) ?? fields[0]
            const needsRange = filter.op === 'between'
            return (
              <div key={`${filter.field}-${index}`} className="rounded-xl border border-[#e4e7ee] bg-white px-3 py-3">
                <div className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_1fr_auto]">
                  <select
                    value={filter.field}
                    onChange={(event) => {
                      const nextField = fields.find((item) => item.key === event.target.value) ?? fields[0]
                      upsert(index, { field: event.target.value, op: nextField?.operators[0] ?? 'eq', value: '', value_to: '' })
                    }}
                    className="form-input-sm"
                  >
                    {fields.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </select>
                  <select
                    value={filter.op}
                    onChange={(event) => upsert(index, { op: event.target.value, value: '', value_to: '' })}
                    className="form-input-sm"
                  >
                    {(field?.operators ?? []).map((operator) => (
                      <option key={operator} value={operator}>{getAnalyticsOperatorLabel(operator)}</option>
                    ))}
                  </select>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      value={String(filter.value ?? '')}
                      onChange={(event) => upsert(index, { value: event.target.value })}
                      className="form-input-sm"
                      placeholder="값"
                    />
                    {needsRange ? (
                      <input
                        value={String(filter.value_to ?? '')}
                        onChange={(event) => upsert(index, { value_to: event.target.value })}
                        className="form-input-sm"
                        placeholder="끝값"
                      />
                    ) : (
                      <div className="hidden md:block" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(filters.filter((_, current) => current !== index))}
                    className="inline-flex items-center justify-center rounded-lg border border-[#e6d0d2] bg-[#f6ecec] px-2 text-[#6d3e44]"
                    aria-label="필터 제거"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
