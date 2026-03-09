import { useMemo } from 'react'

import type { DashboardPipelineResponse } from '../../lib/api'

interface InvestmentPipelineProps {
  pipeline: DashboardPipelineResponse
  onNavigate: (path: string) => void
}

const STAGE_ORDER = ['소싱', '검토중', '실사중', '상정', '의결', '집행'] as const

export default function InvestmentPipeline({ pipeline, onNavigate }: InvestmentPipelineProps) {
  const stageMap = useMemo(
    () => new Map(pipeline.stages.map((stage) => [stage.stage, stage.count])),
    [pipeline.stages],
  )

  return (
    <section className="card-base min-h-[320px] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#0f1f3d]">투자 파이프라인</h3>
          <p className="mt-1 text-xs text-[#64748b]">단계 순서를 따라 어디에 심의가 몰려 있는지 바로 확인합니다.</p>
        </div>
        <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-1 text-xs font-semibold text-[#1a3660]">
          총 {pipeline.total_count}건
        </span>
      </div>

      {pipeline.total_count === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#d8e5fb] bg-[#fbfdff] px-4 py-10 text-center text-sm text-[#64748b]">
          진행 중인 심의 건이 없습니다.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid gap-2 md:grid-cols-6">
            {STAGE_ORDER.map((stage, index) => {
              const count = stageMap.get(stage) ?? 0
              const active = count > 0
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => onNavigate('/investment-reviews')}
                  className={`relative rounded-2xl border px-3 py-4 text-left transition ${
                    active
                      ? 'border-[#aac6fa] bg-[#f5f9ff] shadow-[0_12px_28px_rgba(15,31,61,0.06)] hover:-translate-y-[2px]'
                      : 'border-[#e4e7ee] bg-white hover:border-[#d8e5fb] hover:bg-[#fbfdff]'
                  }`}
                >
                  {index < STAGE_ORDER.length - 1 ? (
                    <span className="pointer-events-none absolute right-[-9px] top-1/2 hidden h-[2px] w-[18px] -translate-y-1/2 bg-[#d8e5fb] md:block" />
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0f1f3d]">{stage}</span>
                    <span
                      className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded-full px-2 text-xs font-semibold ${
                        active ? 'bg-[#0f1f3d] text-white' : 'bg-[#eef3fb] text-[#64748b]'
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                  <p className="mt-3 text-[11px] text-[#64748b]">
                    {active ? `${pipeline.total_count}건 중 ${count}건 진행 중` : '현재 진행 건 없음'}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="rounded-2xl border border-[#d8e5fb] bg-[#fbfdff] px-4 py-3 text-xs text-[#64748b]">
            완료와 중단은 투자심의 화면의 별도 레인에서 확인할 수 있습니다.
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-[#1a3660] hover:text-[#558ef8]"
          onClick={() => onNavigate('/investment-reviews')}
        >
          심의 현황 열기
        </button>
      </div>
    </section>
  )
}
