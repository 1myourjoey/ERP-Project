import type { AnalyticsExecutiveCard, AnalyticsQueryResponse } from '../../../lib/api/analytics'
import { formatAnalyticsValue } from '../../../lib/analytics/formatters'
import {
  toExecutiveCartesianData,
  toExecutiveDonutData,
  toExecutiveMetrics,
  toExecutiveTableData,
} from '../../../lib/analytics/executiveTransform'
import ExecutiveBarChart from './charts/ExecutiveBarChart'
import ExecutiveCompactMetricValue from './charts/ExecutiveCompactMetricValue'
import ExecutiveDonutChart from './charts/ExecutiveDonutChart'
import ExecutiveKpiCard from './charts/ExecutiveKpiCard'
import ExecutiveLineChart from './charts/ExecutiveLineChart'
import ExecutiveRankedBarChart from './charts/ExecutiveRankedBarChart'

interface ExecutiveChartCardProps {
  card: AnalyticsExecutiveCard
  response?: AnalyticsQueryResponse | null
  loading?: boolean
  error?: string | null
  expanded?: boolean
  onOpenDetail: () => void
  onOpenStudio: () => void
}

function getCardHeightClass(height: AnalyticsExecutiveCard['height'], expanded: boolean) {
  if (expanded) return 'min-h-[520px]'
  if (height === 'sm') return 'min-h-[198px]'
  if (height === 'lg') return 'min-h-[420px]'
  return 'min-h-[340px]'
}

function ExecutiveSeriesLegend({
  items,
}: {
  items: Array<{ key: string; label: string; color: string }>
}) {
  if (items.length <= 1) return null

  return (
    <div className="mt-3 flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <span
          key={item.key}
          title={item.label}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e7efff] bg-[#f8fbff] px-2.5 py-1 text-[11px] font-semibold text-[#64748b]"
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="max-w-[112px] truncate">{item.label}</span>
        </span>
      ))}
    </div>
  )
}

function renderVisual(card: AnalyticsExecutiveCard, response?: AnalyticsQueryResponse | null) {
  if (!response || response.rows.length === 0) {
    if (card.visual_type === 'kpi' && response) {
      const metrics = toExecutiveMetrics(response)
      if (metrics.length > 0) return <ExecutiveKpiCard metrics={metrics} compact />
    }
    return <div className="flex h-full items-center justify-center text-sm text-[#94a3b8]">표시할 데이터가 없습니다.</div>
  }

  if (card.visual_type === 'kpi') {
    return <ExecutiveKpiCard metrics={toExecutiveMetrics(response)} compact />
  }

  if (card.visual_type === 'donut') {
    return <ExecutiveDonutChart data={toExecutiveDonutData(response)} />
  }

  if (card.visual_type === 'line') {
    return <ExecutiveLineChart chart={toExecutiveCartesianData(response)} />
  }

  if (card.visual_type === 'stacked_area') {
    return <ExecutiveLineChart chart={toExecutiveCartesianData(response)} area />
  }

  if (card.visual_type === 'ranked_bar') {
    return <ExecutiveRankedBarChart chart={toExecutiveCartesianData(response)} />
  }

  if (card.visual_type === 'stacked_bar') {
    return <ExecutiveBarChart chart={toExecutiveCartesianData(response)} stacked />
  }

  if (card.visual_type === 'grouped_bar' || card.visual_type === 'bar') {
    return <ExecutiveBarChart chart={toExecutiveCartesianData(response)} />
  }

  const table = toExecutiveTableData(response)
  return (
    <div className="overflow-auto rounded-xl border border-[#e7efff]">
      <table className="min-w-full text-left">
        <thead className="bg-[#f8fbff]">
          <tr>
            {table.columns.map((column) => (
              <th key={column.key} className="border-b border-[#e7efff] px-3 py-2 text-[11px] font-semibold text-[#64748b]">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.slice(0, 8).map((row, index) => (
            <tr key={index} className="bg-white">
              {table.columns.map((column) => (
                <td
                  key={column.key}
                  className="border-b border-[#eef3fb] px-3 py-2 text-xs text-[#0f1f3d]"
                  title={String(row[column.key] ?? '')}
                >
                  <span className="block max-w-[160px] truncate">
                    {formatAnalyticsValue(row[column.key], column.type, column.key)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ExecutiveChartCard({
  card,
  response,
  loading = false,
  error,
  expanded = false,
  onOpenDetail,
  onOpenStudio,
}: ExecutiveChartCardProps) {
  const metrics = toExecutiveMetrics(response).slice(0, 3)
  const cartesianLegend =
    response && ['line', 'stacked_area', 'bar', 'grouped_bar', 'stacked_bar', 'ranked_bar'].includes(card.visual_type)
      ? toExecutiveCartesianData(response).series
      : []
  const donutLegend =
    response && card.visual_type === 'donut'
      ? toExecutiveDonutData(response).map((item) => ({ key: item.key, label: item.label, color: item.color }))
      : []
  const legendItems = cartesianLegend.length > 0 ? cartesianLegend : donutLegend

  return (
    <article className={`min-w-0 overflow-visible rounded-2xl border border-[#d8e5fb] bg-white p-4 shadow-sm ${getCardHeightClass(card.height, expanded)}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <p className="truncate font-title text-sm font-semibold text-[#0f1f3d]" title={card.title}>
            {card.title}
          </p>
          <p className="mt-1 max-w-full truncate text-xs leading-5 text-[#64748b]" title={card.description}>
            {card.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-start">
          {!expanded && (
            <button type="button" onClick={onOpenDetail} className="ghost-btn btn-xs" title="상세 보기">
              상세
            </button>
          )}
          <button type="button" onClick={onOpenStudio} className="secondary-btn btn-xs" title="직접 분석으로 열기">
            분석
          </button>
        </div>
      </div>

      <div className={`min-w-0 overflow-hidden ${expanded ? 'mt-4 h-[360px]' : card.visual_type === 'kpi' ? 'mt-4' : 'mt-4 h-[220px]'}`}>
        {loading ? (
          <div className="grid h-full grid-cols-2 gap-3">
            <div className="skeleton h-full" />
            <div className="skeleton h-full" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-[#bfa5a7] bg-[#f1e8e9] px-4 text-sm text-[#6d3e44]">
            {error}
          </div>
        ) : (
          renderVisual(card, response)
        )}
      </div>

      {!loading && !error && legendItems.length > 1 && <ExecutiveSeriesLegend items={legendItems} />}

      {!loading && !error && card.visual_type !== 'kpi' && metrics.length > 0 && (
        <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.key} className="min-w-0 rounded-xl border border-[#e7efff] bg-[#f8fbff] px-3 py-2">
              <p className="truncate text-[10px] font-semibold text-[#64748b]" title={metric.label}>
                {metric.label}
              </p>
              <div className="mt-1 min-w-0">
                <ExecutiveCompactMetricValue
                  value={metric.value}
                  fieldKey={metric.key}
                  className="font-data text-sm font-semibold leading-tight text-[#0f1f3d]"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
