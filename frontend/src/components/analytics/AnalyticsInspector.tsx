import type { AnalyticsFieldMeta, AnalyticsQueryOptions, AnalyticsSort } from '../../lib/api/analytics'
import { getAnalyticsFieldLabel } from '../../lib/analytics/labels'

interface AnalyticsInspectorProps {
  options: AnalyticsQueryOptions
  sorts: AnalyticsSort[]
  fieldMap: Record<string, AnalyticsFieldMeta>
  onOptionsChange: (patch: Partial<AnalyticsQueryOptions>) => void
  onSortsChange: (sorts: AnalyticsSort[]) => void
}

export default function AnalyticsInspector({ options, sorts, fieldMap, onOptionsChange, onSortsChange }: AnalyticsInspectorProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-4 shadow-sm">
        <h4 className="text-sm font-semibold text-[#0f1f3d]">표시 옵션</h4>
        <div className="mt-3 space-y-2 text-sm text-[#64748b]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.show_subtotals} onChange={(event) => onOptionsChange({ show_subtotals: event.target.checked })} /> 소계 표시</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.show_grand_totals} onChange={(event) => onOptionsChange({ show_grand_totals: event.target.checked })} /> 전체합 표시</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.hide_empty} onChange={(event) => onOptionsChange({ hide_empty: event.target.checked })} /> 빈 값 숨김</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.hide_zero} onChange={(event) => onOptionsChange({ hide_zero: event.target.checked })} /> 0 값 숨김</label>
        </div>
      </div>

      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-4 shadow-sm">
        <h4 className="text-sm font-semibold text-[#0f1f3d]">정렬/제한</h4>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#64748b]">행 제한</label>
            <input type="number" min={10} max={500} value={options.row_limit} onChange={(event) => onOptionsChange({ row_limit: Number(event.target.value || 200) })} className="form-input-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#64748b]">현재 정렬</label>
            {sorts.length === 0 ? (
              <p className="text-xs text-[#94a3b8]">정렬이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {sorts.map((sort, index) => (
                  <div key={`${sort.field}-${index}`} className="flex items-center justify-between rounded-lg border border-[#e4e7ee] bg-[#f7f9ff] px-2.5 py-2 text-xs">
                    <span className="truncate text-[#0f1f3d]">{getAnalyticsFieldLabel(sort.field, fieldMap)}</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={sort.direction}
                        onChange={(event) => onSortsChange(sorts.map((row, current) => current === index ? { ...row, direction: event.target.value as 'asc' | 'desc' } : row))}
                        className="rounded border border-[#d8e5fb] bg-white px-1 py-0.5 text-[11px]"
                      >
                        <option value="asc">오름차순</option>
                        <option value="desc">내림차순</option>
                      </select>
                      <button type="button" onClick={() => onSortsChange(sorts.filter((_, current) => current !== index))} className="text-[#6d3e44]">삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
