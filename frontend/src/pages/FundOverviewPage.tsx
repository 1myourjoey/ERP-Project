import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, CalendarDays, Download } from 'lucide-react'

import EmptyState from '../components/EmptyState'
import { fetchFundOverview, type FundOverviewItem } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null) return '-'
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function toMillionUnit(value: number | null | undefined): number | null | undefined {
  if (value == null) return value
  return Math.abs(value) >= 1_000_000 ? value / 1_000_000 : value
}

function formatMillion(value: number | null | undefined, digits = 0): string {
  return formatNumber(toMillionUnit(value), digits)
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-'
  return `${formatNumber(value, 2)}%`
}

function textOrDash(value: string | null | undefined): string {
  if (!value) return '-'
  return value
}

function getRatioClass(value: number | null | undefined): string {
  if (value == null) return 'text-[#64748b]'
  if (value > 80) return 'text-red-600'
  if (value > 50) return 'text-amber-600'
  return 'text-emerald-600'
}

export default function FundOverviewPage() {
  const navigate = useNavigate()
  const [referenceDate, setReferenceDate] = useState<string>(todayIso())

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.funds.overview, referenceDate],
    queryFn: () => fetchFundOverview(referenceDate),
  })

  const funds = data?.funds ?? []
  const totals = data?.totals
  const effectiveReferenceDate = data?.reference_date ?? referenceDate

  const downloadExcel = () => {
    const params = new URLSearchParams()
    if (referenceDate) params.set('reference_date', referenceDate)
    const query = params.toString()
    const url = query ? `/api/funds/overview/export?${query}` : '/api/funds/overview/export'
    window.open(url, '_blank')
  }

  const kpiCards = useMemo(
    () => [
      { label: '총 약정액', value: `${formatMillion(totals?.commitment_total)} 백만원` },
      {
        label: '투자율',
        value:
          totals?.commitment_total && totals.commitment_total > 0
            ? `${formatPercent((totals.total_invested / totals.commitment_total) * 100)}`
            : '-',
      },
      {
        label: '배분율',
        value:
          totals?.commitment_total && totals.commitment_total > 0 && (totals.total_distributed ?? null) != null
            ? `${formatPercent(((totals.total_distributed || 0) / totals.commitment_total) * 100)}`
            : '-',
      },
      { label: '운용 NAV', value: `${formatMillion(totals?.investment_assets)} 백만원` },
      { label: '진행 워크플로', value: `${totals?.active_workflow_count ?? 0}건` },
      { label: '미완료 업무', value: `${totals?.pending_task_count ?? 0}건` },
    ],
    [totals],
  )

  const tableHeadClass = 'table-head-cell whitespace-nowrap break-keep text-[11px] font-semibold leading-tight'
  const tableBodyClass = 'table-body-cell whitespace-nowrap'
  const tableNumberClass = `${tableBodyClass} text-right tabular-nums`

  return (
    <div className="page-container space-y-5">
      <div className="page-header gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="page-title">투자개요</h2>
          <p className="page-subtitle">기준일 기준 조합별 핵심 지표를 한눈에 비교합니다.</p>
        </div>
        <div className="w-full rounded-lg border border-[#d8e5fb] bg-[#f5f9ff] p-2.5 sm:w-auto">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <label
              htmlFor="fund-overview-reference-date"
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[#64748b]"
            >
              <CalendarDays size={13} />
              기준일
            </label>
            <input
              id="fund-overview-reference-date"
              type="date"
              value={referenceDate}
              onChange={(event) => setReferenceDate(event.target.value)}
              className="form-input h-9 w-[180px] min-w-[180px] bg-white"
            />
            <button onClick={downloadExcel} className="primary-btn h-9 w-auto gap-1 whitespace-nowrap px-3">
              <Download size={14} />
              엑셀 다운로드
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((card) => (
          <div key={card.label} className="card-base !p-[10px]">
            <p className="truncate text-[11px] font-medium text-[#64748b]">{card.label}</p>
            <p
              className="mt-1 truncate whitespace-nowrap text-base font-semibold leading-tight text-[#0f1f3d] sm:text-[17px]"
              title={card.value}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="card-base overflow-hidden p-0">
        <div className="flex flex-col items-start justify-between gap-1 border-b border-[#d8e5fb] px-4 py-3 sm:flex-row sm:items-center sm:gap-2">
          <h3 className="text-sm font-semibold text-[#0f1f3d]">조합 비교표</h3>
          <p className="text-xs text-[#64748b] sm:whitespace-nowrap">
            기준일: {effectiveReferenceDate} · 단위: 백만원 · 총 {funds.length.toLocaleString('ko-KR')}개
          </p>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-[#64748b]">데이터를 불러오는 중...</div>
        ) : funds.length === 0 ? (
          <EmptyState icon={<BarChart3 size={20} />} message="표시할 조합이 없습니다." className="py-10" />
        ) : (
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-5 bg-gradient-to-l from-white to-transparent" aria-hidden="true" />
            <div className="max-h-[calc(100vh-330px)] overflow-auto">
              <table className="w-max min-w-[2080px] text-sm">
                <thead className="table-head-row sticky top-0 z-20 border-b border-[#d8e5fb] bg-[#f5f9ff]">
                  <tr>
                    <th className={`${tableHeadClass} sticky left-0 z-30 min-w-[58px] bg-[#f5f9ff] text-center`}>NO</th>
                    <th className={`${tableHeadClass} min-w-[220px]`}>조합명</th>
                    <th className={`${tableHeadClass} min-w-[120px]`}>조합 구분</th>
                    <th className={`${tableHeadClass} min-w-[100px]`}>상태</th>
                    <th className={`${tableHeadClass} min-w-[140px]`}>대표 펀드매니저</th>
                    <th className={`${tableHeadClass} min-w-[120px]`}>등록(성립)일</th>
                    <th className={`${tableHeadClass} min-w-[120px]`}>투자기간 종료일</th>
                    <th className={`${tableHeadClass} min-w-[130px]`}>투자기간 경과율</th>
                    <th className={`${tableHeadClass} min-w-[120px]`}>청산시기(예정)</th>
                    <th className={`${tableHeadClass} min-w-[118px] text-right`}>약정총액</th>
                    <th className={`${tableHeadClass} min-w-[118px] text-right`}>납입총액</th>
                    <th className={`${tableHeadClass} min-w-[96px] text-right`}>납입비율</th>
                    <th className={`${tableHeadClass} min-w-[118px] text-right`}>GP출자금</th>
                    <th className={`${tableHeadClass} min-w-[118px] text-right`}>투자총액</th>
                    <th className={`${tableHeadClass} min-w-[118px] text-right`}>미투자액</th>
                    <th className={`${tableHeadClass} min-w-[118px] text-right`}>투자자산</th>
                    <th className={`${tableHeadClass} min-w-[96px] text-right`}>투자업체수</th>
                    <th className={`${tableHeadClass} min-w-[112px] text-right`}>진행 워크플로</th>
                    <th className={`${tableHeadClass} min-w-[108px] text-right`}>미완료 업무</th>
                    <th className={`${tableHeadClass} min-w-[126px] text-right`}>기준수익률(규약)</th>
                    <th className={`${tableHeadClass} min-w-[120px]`}>잔존기간</th>
                  </tr>
                </thead>
                <tbody>
                  {funds.map((fund: FundOverviewItem) => (
                    <tr
                      key={fund.id}
                      onClick={() => navigate(`/funds/${fund.id}`)}
                      className="group cursor-pointer border-t border-[#e6eefc] hover:bg-[#f5f9ff]"
                    >
                      <td className={`${tableBodyClass} sticky left-0 z-10 bg-white text-center font-medium group-hover:bg-[#f5f9ff]`}>
                        {fund.no}
                      </td>
                      <td className={`${tableBodyClass} font-medium text-[#0f1f3d]`}>
                        <span className="block max-w-[220px] truncate" title={fund.name}>
                          {fund.name}
                        </span>
                      </td>
                      <td className={`${tableBodyClass} text-[#0f1f3d]`}>
                        <span className="block max-w-[120px] truncate" title={textOrDash(fund.fund_type)}>
                          {textOrDash(fund.fund_type)}
                        </span>
                      </td>
                      <td className={tableBodyClass}>
                        <span className="inline-flex whitespace-nowrap rounded-full bg-[#fff7d6] px-2 py-0.5 text-xs text-[#0f1f3d]">
                          {textOrDash(fund.status)}
                        </span>
                      </td>
                      <td className={`${tableBodyClass} text-[#0f1f3d]`}>
                        <span className="block max-w-[140px] truncate" title={textOrDash(fund.fund_manager)}>
                          {textOrDash(fund.fund_manager)}
                        </span>
                      </td>
                      <td className={`${tableBodyClass} text-[#64748b]`}>{textOrDash(fund.registration_date || fund.formation_date)}</td>
                      <td className={`${tableBodyClass} text-[#64748b]`}>{textOrDash(fund.investment_period_end)}</td>
                      <td className={`${tableBodyClass} min-w-[130px]`}>
                        <div className={`font-semibold ${getRatioClass(fund.investment_period_progress)}`}>
                          {formatPercent(fund.investment_period_progress)}
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-[#fff7d6]">
                          <div
                            className="h-1.5 rounded-full bg-[#558ef8]"
                            style={{ width: `${Math.max(0, Math.min(100, fund.investment_period_progress || 0))}%` }}
                          />
                        </div>
                      </td>
                      <td className={`${tableBodyClass} text-[#64748b]`}>{textOrDash(fund.maturity_date)}</td>
                      <td className={tableNumberClass}>{formatMillion(fund.commitment_total)}</td>
                      <td className={tableNumberClass}>{formatMillion(fund.total_paid_in)}</td>
                      <td className={`${tableNumberClass} font-medium ${getRatioClass(fund.paid_in_ratio)}`}>
                        {formatPercent(fund.paid_in_ratio)}
                      </td>
                      <td className={tableNumberClass}>{formatMillion(fund.gp_commitment)}</td>
                      <td className={tableNumberClass}>{formatMillion(fund.total_invested)}</td>
                      <td className={tableNumberClass}>{formatMillion(fund.uninvested)}</td>
                      <td className={tableNumberClass}>{formatMillion(fund.investment_assets)}</td>
                      <td className={tableNumberClass}>{formatNumber(fund.company_count)}</td>
                      <td className={tableNumberClass}>{formatNumber(fund.active_workflow_count)}</td>
                      <td className={tableNumberClass}>{formatNumber(fund.pending_task_count)}</td>
                      <td className={tableNumberClass}>{formatPercent(fund.hurdle_rate)}</td>
                      <td className={`${tableBodyClass} text-[#0f1f3d]`}>{textOrDash(fund.remaining_period)}</td>
                    </tr>
                  ))}
                  <tr className="sticky bottom-0 z-20 border-t-2 border-[#0f1f3d] bg-[#fff7d6] font-semibold text-[#0f1f3d] shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
                    <td className="sticky left-0 z-30 bg-[#fff7d6] px-3 py-3 whitespace-nowrap" colSpan={9}>
                      합계
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatMillion(totals?.commitment_total)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatMillion(totals?.total_paid_in)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">-</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatMillion(totals?.gp_commitment)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatMillion(totals?.total_invested)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatMillion(totals?.uninvested)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatMillion(totals?.investment_assets)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatNumber(totals?.company_count)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatNumber(totals?.active_workflow_count)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{formatNumber(totals?.pending_task_count)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">-</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
