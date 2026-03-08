import type {
  AnalyticsBatchQueryResult,
  AnalyticsExecutiveCard,
  AnalyticsExecutiveFilterOptions,
  AnalyticsExecutivePack,
} from '../../../lib/api/analytics'
import type { ExecutiveFilterState } from '../../../lib/analytics/executiveFilters'
import ExecutiveDrilldownDrawer from './ExecutiveDrilldownDrawer'
import ExecutiveFilterStrip from './ExecutiveFilterStrip'
import ExecutiveKpiStrip from './ExecutiveKpiStrip'
import ExecutivePackTabs from './ExecutivePackTabs'
import ExecutiveSectionGrid from './ExecutiveSectionGrid'

interface ExecutiveSurfaceProps {
  packs: AnalyticsExecutivePack[]
  activePackKey: string
  filterOptions: AnalyticsExecutiveFilterOptions
  filters: ExecutiveFilterState
  loading: boolean
  resultMap: Map<string, AnalyticsBatchQueryResult>
  drilldownCard: AnalyticsExecutiveCard | null
  onPackChange: (packKey: string) => void
  onDatePresetChange: (datePreset: ExecutiveFilterState['datePreset']) => void
  onToggleFund: (fundValue: string) => void
  onResetFilters: () => void
  onOpenDetail: (card: AnalyticsExecutiveCard) => void
  onCloseDetail: () => void
  onOpenStudio: (card: AnalyticsExecutiveCard) => void
}

export default function ExecutiveSurface({
  packs,
  activePackKey,
  filterOptions,
  filters,
  loading,
  resultMap,
  drilldownCard,
  onPackChange,
  onDatePresetChange,
  onToggleFund,
  onResetFilters,
  onOpenDetail,
  onCloseDetail,
  onOpenStudio,
}: ExecutiveSurfaceProps) {
  const activePack = packs.find((pack) => pack.key === activePackKey) ?? packs[0] ?? null
  const drilldownResult = drilldownCard ? resultMap.get(drilldownCard.key) : undefined

  if (!activePack) {
    return (
      <div className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-10 text-center text-sm text-[#64748b] shadow-sm">
        임원용 분석 카드가 아직 준비되지 않았습니다.
      </div>
    )
  }

  const kpiSections = activePack.sections.filter((section) => section.layout === 'kpi')
  const gridSections = activePack.sections.filter((section) => section.layout !== 'kpi')

  return (
    <div className="space-y-4">
      <ExecutiveFilterStrip
        datePreset={filters.datePreset}
        funds={filters.funds}
        fundOptions={filterOptions.funds}
        onDatePresetChange={onDatePresetChange}
        onToggleFund={onToggleFund}
        onReset={onResetFilters}
      />

      <ExecutivePackTabs packs={packs} activePackKey={activePack.key} onChange={onPackChange} />

      <section className="rounded-2xl border border-[#d8e5fb] bg-white px-4 py-4 shadow-sm">
        <p className="font-title text-lg font-semibold text-[#0f1f3d]">{activePack.label}</p>
        <p className="mt-1 text-sm text-[#64748b]">{activePack.description}</p>
      </section>

      {kpiSections.map((section) => (
        <div key={section.key} className="space-y-2">
          <div className="px-1">
            <p className="text-sm font-semibold text-[#0f1f3d]">{section.label}</p>
          </div>
          <ExecutiveKpiStrip
            cards={section.cards}
            resultMap={resultMap}
            loading={loading}
            onOpenDetail={onOpenDetail}
            onOpenStudio={onOpenStudio}
          />
        </div>
      ))}

      {gridSections.map((section) => (
        <ExecutiveSectionGrid
          key={section.key}
          section={section}
          resultMap={resultMap}
          loading={loading}
          onOpenDetail={onOpenDetail}
          onOpenStudio={onOpenStudio}
        />
      ))}

      <ExecutiveDrilldownDrawer
        open={Boolean(drilldownCard)}
        card={drilldownCard}
        response={drilldownResult?.response ?? null}
        error={drilldownResult?.error ?? null}
        onClose={onCloseDetail}
        onOpenStudio={onOpenStudio}
      />
    </div>
  )
}
