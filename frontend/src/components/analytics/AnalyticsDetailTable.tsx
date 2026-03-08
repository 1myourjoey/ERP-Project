import type { AnalyticsResultField, AnalyticsQueryResponse } from '../../lib/api/analytics'
import { formatAnalyticsValue } from '../../lib/analytics/formatters'
import { getAnalyticsCompactLabel } from '../../lib/analytics/labels'

interface AnalyticsDetailTableProps {
  response: AnalyticsQueryResponse
}

function getColumnWidthClass(field: AnalyticsResultField) {
  if (field.data_type === 'number') return 'min-w-[112px]'
  if (field.data_type === 'date' || field.data_type === 'datetime' || field.data_type === 'boolean') {
    return 'min-w-[120px] max-w-[140px]'
  }
  return 'min-w-[140px] max-w-[220px]'
}

export default function AnalyticsDetailTable({ response }: AnalyticsDetailTableProps) {
  if (response.rows.length === 0) {
    return <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-10 text-center text-sm text-[#64748b]">결과가 없습니다.</div>
  }

  return (
    <div className="overflow-x-auto overflow-y-auto rounded-2xl border border-[#d8e5fb] bg-white shadow-sm">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[#f5f9ff]">
          <tr>
            {response.table_fields.map((field) => (
              <th
                key={field.key}
                title={field.label}
                className={`${getColumnWidthClass(field)} h-11 border-b border-[#d8e5fb] px-3 py-2 text-center text-xs font-semibold text-[#1a3660]`}
              >
                <span className="block truncate whitespace-nowrap">{getAnalyticsCompactLabel(field.label)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {response.rows.map((row, index) => (
            <tr key={index} className="h-10 border-b border-[#eef3fb] last:border-b-0">
              {response.table_fields.map((field) => {
                const formatted = formatAnalyticsValue(row[field.key], field.data_type, field.key)
                const alignClass =
                  field.data_type === 'number'
                    ? 'text-right font-[IBM_Plex_Sans_KR]'
                    : 'text-left'

                return (
                  <td
                    key={`${index}-${field.key}`}
                    className={`${getColumnWidthClass(field)} px-3 py-2 text-xs text-[#0f1f3d] ${alignClass}`}
                  >
                    <div className="truncate whitespace-nowrap" title={formatted}>
                      {formatted}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
