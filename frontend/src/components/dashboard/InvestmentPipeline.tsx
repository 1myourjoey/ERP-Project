import type { DashboardPipelineResponse } from '../../lib/api'

interface InvestmentPipelineProps {
  pipeline: DashboardPipelineResponse
  onNavigate: (path: string) => void
}

function widthPct(count: number, total: number): string {
  if (total <= 0) return '0%'
  return `${Math.max(0, Math.min(100, Math.round((count / total) * 100)))}%`
}

export default function InvestmentPipeline({ pipeline, onNavigate }: InvestmentPipelineProps) {
  return (
    <section className="card-base min-h-[320px] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0f1f3d]">투자 파이프라인</h3>
        <span className="text-xs text-[#64748b]">총 {pipeline.total_count}건</span>
      </div>

      <div className="mt-3 space-y-2">
        {pipeline.stages.length === 0 && (
          <p className="text-xs text-[#64748b]">진행 중인 심의 건이 없습니다.</p>
        )}
        {pipeline.stages.map((stage) => (
          <button
            key={stage.stage}
            type="button"
            className="w-full rounded-lg border border-[#e4e7ee] px-2.5 py-2 text-left hover:bg-[#f5f9ff]"
            onClick={() => onNavigate('/investment-reviews')}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#0f1f3d]">{stage.stage}</span>
              <span className="text-xs text-[#64748b]">{stage.count}건</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-[#d8e5fb]">
              <div className="h-1.5 rounded-full bg-[#558ef8]" style={{ width: widthPct(stage.count, pipeline.total_count) }} />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-[#1a3660] hover:text-[#558ef8]"
          onClick={() => onNavigate('/investment-reviews')}
        >
          심의 현황 →
        </button>
      </div>
    </section>
  )
}
