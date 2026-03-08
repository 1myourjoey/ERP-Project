import type {
  AnalyticsBatchQueryResult,
  AnalyticsExecutiveCard,
} from '../../../lib/api/analytics'
import ExecutiveChartCard from './ExecutiveChartCard'

interface ExecutiveKpiStripProps {
  cards: AnalyticsExecutiveCard[]
  resultMap: Map<string, AnalyticsBatchQueryResult>
  loading: boolean
  onOpenDetail: (card: AnalyticsExecutiveCard) => void
  onOpenStudio: (card: AnalyticsExecutiveCard) => void
}

export default function ExecutiveKpiStrip({
  cards,
  resultMap,
  loading,
  onOpenDetail,
  onOpenStudio,
}: ExecutiveKpiStripProps) {
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
      {cards.map((card) => {
        const result = resultMap.get(card.key)
        return (
          <ExecutiveChartCard
            key={card.key}
            card={card}
            response={result?.response ?? null}
            error={result?.error ?? null}
            loading={loading && !result}
            onOpenDetail={() => onOpenDetail(card)}
            onOpenStudio={() => onOpenStudio(card)}
          />
        )
      })}
    </div>
  )
}
