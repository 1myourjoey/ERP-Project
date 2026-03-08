import AnalyticsSideDrawer from '../AnalyticsSideDrawer'
import SectionScaffold from '../../common/page/SectionScaffold'
import type { AnalyticsExecutiveCard, AnalyticsQueryResponse } from '../../../lib/api/analytics'
import { formatAnalyticsValue } from '../../../lib/analytics/formatters'
import { toExecutiveTableData } from '../../../lib/analytics/executiveTransform'
import ExecutiveChartCard from './ExecutiveChartCard'

interface ExecutiveDrilldownDrawerProps {
  open: boolean
  card: AnalyticsExecutiveCard | null
  response?: AnalyticsQueryResponse | null
  error?: string | null
  onClose: () => void
  onOpenStudio: (card: AnalyticsExecutiveCard) => void
}

export default function ExecutiveDrilldownDrawer({
  open,
  card,
  response,
  error,
  onClose,
  onOpenStudio,
}: ExecutiveDrilldownDrawerProps) {
  const table = toExecutiveTableData(response)

  return (
    <AnalyticsSideDrawer
      open={open && Boolean(card)}
      side="right"
      title={card?.title ?? '상세 보기'}
      subtitle={card?.description}
      widthClassName="w-[min(760px,calc(100vw-16px))]"
      onClose={onClose}
    >
      {card ? (
        <div className="space-y-4">
          <ExecutiveChartCard
            card={card}
            response={response ?? null}
            error={error ?? null}
            expanded
            onOpenDetail={() => undefined}
            onOpenStudio={() => onOpenStudio(card)}
          />

          {table.columns.length > 0 && (
            <SectionScaffold title="원본 행 미리보기">
              <div className="overflow-auto rounded-xl border border-[#e7efff]">
                <table className="min-w-full text-left">
                  <thead className="bg-[#f8fbff]">
                    <tr>
                      {table.columns.map((column) => (
                        <th
                          key={column.key}
                          className="border-b border-[#e7efff] px-3 py-2 text-[11px] font-semibold text-[#64748b]"
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, 12).map((row, index) => (
                      <tr key={index}>
                        {table.columns.map((column) => (
                          <td
                            key={column.key}
                            className="border-b border-[#eef3fb] px-3 py-2 text-xs text-[#0f1f3d]"
                            title={String(row[column.key] ?? '')}
                          >
                            <span className="block max-w-[220px] truncate">
                              {formatAnalyticsValue(row[column.key], column.type, column.key)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionScaffold>
          )}
        </div>
      ) : null}
    </AnalyticsSideDrawer>
  )
}
