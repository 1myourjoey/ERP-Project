import SectionScaffold from '../../common/page/SectionScaffold'
import type {
  AnalyticsBatchQueryResult,
  AnalyticsExecutiveCard,
  AnalyticsExecutiveSection,
} from '../../../lib/api/analytics'
import ExecutiveChartCard from './ExecutiveChartCard'

interface ExecutiveSectionGridProps {
  section: AnalyticsExecutiveSection
  resultMap: Map<string, AnalyticsBatchQueryResult>
  loading: boolean
  onOpenDetail: (card: AnalyticsExecutiveCard) => void
  onOpenStudio: (card: AnalyticsExecutiveCard) => void
}

export default function ExecutiveSectionGrid({
  section,
  resultMap,
  loading,
  onOpenDetail,
  onOpenStudio,
}: ExecutiveSectionGridProps) {
  return (
    <SectionScaffold title={section.label} bodyClassName="space-y-0">
      <div className="grid min-w-0 gap-3 2xl:grid-cols-3 xl:grid-cols-2">
        {section.cards.map((card) => {
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
    </SectionScaffold>
  )
}
