import type { AnalyticsQueryResponse } from '../../lib/api/analytics'
import { formatAnalyticsValue } from '../../lib/analytics/formatters'
import { getAnalyticsCompactLabel } from '../../lib/analytics/labels'
import { buildPivotMatrix } from '../../lib/analytics/pivotTransform'

interface PivotMatrixTableProps {
  response: AnalyticsQueryResponse
  onCellClick?: (columnKey: string, rowKey: string) => void
}

export default function PivotMatrixTable({ response, onCellClick }: PivotMatrixTableProps) {
  const matrix = buildPivotMatrix(response)

  if (matrix.rows.length === 0) {
    return <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-10 text-center text-sm text-[#64748b]">결과가 없습니다.</div>
  }

  return (
    <div className="overflow-x-auto overflow-y-auto rounded-2xl border border-[#d8e5fb] bg-white shadow-sm">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[#f5f9ff]">
          <tr>
            {matrix.rowHeaders.map((label) => (
              <th
                key={label}
                title={label}
                className="h-11 min-w-[140px] max-w-[180px] border-b border-[#d8e5fb] px-3 py-2 text-center text-xs font-semibold text-[#1a3660]"
              >
                <span className="block truncate whitespace-nowrap">{getAnalyticsCompactLabel(label)}</span>
              </th>
            ))}
            {matrix.columns.map((column) => {
              const columnLabel = column.labels.join(' · ')
              return (
                <th
                  key={column.key}
                  title={`${columnLabel} · ${column.measureLabel}`}
                  className="h-11 min-w-[144px] max-w-[200px] border-b border-[#d8e5fb] px-3 py-2 text-center text-xs font-semibold text-[#1a3660]"
                >
                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <span className="min-w-0 truncate">{columnLabel}</span>
                    <span
                      title={column.measureLabel}
                      className="h-5 shrink-0 max-w-[72px] truncate rounded-full border border-[#e7efff] bg-[#fbfdff] px-2 text-[10px] font-semibold leading-5 text-[#64748b]"
                    >
                      {getAnalyticsCompactLabel(column.measureLabel)}
                    </span>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.key} className="border-b border-[#eef3fb] last:border-b-0">
              {row.labels.map((label, index) => (
                <td key={`${row.key}-${index}`} className="max-w-[220px] bg-white px-3 py-2 text-xs font-semibold text-[#0f1f3d]">
                  <div className="truncate whitespace-nowrap" title={label}>
                    {label}
                  </div>
                </td>
              ))}
              {matrix.columns.map((column) => {
                const valueText = formatAnalyticsValue(row.values[column.key], 'number')
                return (
                  <td
                    key={`${row.key}-${column.key}`}
                    className="min-w-[104px] px-2 py-1.5 text-right font-[IBM_Plex_Sans_KR] text-xs text-[#0f1f3d]"
                  >
                    <button
                      type="button"
                      onClick={() => onCellClick?.(column.key, row.key)}
                      title={valueText}
                      className="w-full whitespace-nowrap rounded-md px-1.5 py-1 text-right transition hover:bg-[#f5f9ff]"
                    >
                      {valueText}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
          {Object.keys(matrix.grandTotals).length > 0 && (
            <tr className="bg-[#f5f9ff]">
              <td
                colSpan={Math.max(1, matrix.rowHeaders.length)}
                className="h-10 whitespace-nowrap px-3 py-2 text-xs font-bold text-[#1a3660]"
              >
                총계
              </td>
              {matrix.columns.map((column) => {
                const totalText = formatAnalyticsValue(matrix.grandTotals[column.measureKey], 'number')
                return (
                  <td
                    key={`total-${column.key}`}
                    title={totalText}
                    className="min-w-[104px] whitespace-nowrap px-2 py-1.5 text-right font-[IBM_Plex_Sans_KR] text-xs font-bold text-[#1a3660]"
                  >
                    {totalText}
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
