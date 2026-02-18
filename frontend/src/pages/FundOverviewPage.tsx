import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchFundOverview, type FundOverviewItem } from '../lib/api'

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

function getRatioClass(value: number | null | undefined): string {
  if (value == null) return 'text-gray-600'
  if (value > 80) return 'text-red-600'
  if (value > 50) return 'text-amber-600'
  return 'text-emerald-600'
}

export default function FundOverviewPage() {
  const navigate = useNavigate()
  const [referenceDate, setReferenceDate] = useState<string>(todayIso())

  const { data, isLoading } = useQuery({
    queryKey: ['fundOverview', referenceDate],
    queryFn: () => fetchFundOverview(referenceDate),
  })

  const funds = data?.funds ?? []
  const totals = data?.totals

  const downloadExcel = () => {
    const params = new URLSearchParams()
    if (referenceDate) params.set('reference_date', referenceDate)
    const query = params.toString()
    const url = query ? `/api/funds/overview/export?${query}` : '/api/funds/overview/export'
    window.open(url, '_blank')
  }

  const summaryCards = useMemo(
    () => [
      { label: '조합 수', value: formatNumber(funds.length) },
      { label: '약정총액 합계', value: formatMillion(totals?.commitment_total) },
      { label: '납입총액 합계', value: formatMillion(totals?.total_paid_in) },
      { label: 'GP출자금 합계', value: formatMillion(totals?.gp_commitment) },
      { label: '투자총액 합계', value: formatMillion(totals?.total_invested) },
      { label: '미투자액 합계', value: formatMillion(totals?.uninvested) },
      { label: '투자업체수 합계', value: formatNumber(totals?.company_count) },
    ],
    [funds.length, totals],
  )

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">조합 개요</h1>
          <p className="mt-1 text-sm text-gray-500">기준일 기준 조합별 핵심 지표를 비교합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            기준일
            <input
              type="date"
              value={referenceDate}
              onChange={(event) => setReferenceDate(event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={downloadExcel}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-medium text-gray-700">조합 비교표</p>
          <p className="text-xs text-gray-500">기준일: {data?.reference_date ?? referenceDate} / 단위: 백만원</p>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">데이터를 불러오는 중...</div>
        ) : funds.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">표시할 조합이 없습니다.</div>
        ) : (
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <table className="min-w-[1800px] w-full text-sm">
              <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-600">
                <tr>
                  <th className="sticky left-0 z-30 bg-gray-50 px-3 py-2">NO</th>
                  <th className="px-3 py-2">조합명</th>
                  <th className="px-3 py-2">조합 구분</th>
                  <th className="px-3 py-2">대표 펀드매니저</th>
                  <th className="px-3 py-2">등록(성립)일</th>
                  <th className="px-3 py-2">투자기간 종료일</th>
                  <th className="px-3 py-2">투자기간 경과율</th>
                  <th className="px-3 py-2">청산시기(예정)</th>
                  <th className="px-3 py-2 text-right">약정총액</th>
                  <th className="px-3 py-2 text-right">납입총액</th>
                  <th className="px-3 py-2 text-right">납입비율</th>
                  <th className="px-3 py-2 text-right">GP출자금</th>
                  <th className="px-3 py-2 text-right">투자총액</th>
                  <th className="px-3 py-2 text-right">미투자액</th>
                  <th className="px-3 py-2 text-right">투자자산</th>
                  <th className="px-3 py-2 text-right">투자업체수</th>
                  <th className="px-3 py-2 text-right">기준수익률(규약)</th>
                  <th className="px-3 py-2">잔존기간</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((fund: FundOverviewItem) => (
                  <tr
                    key={fund.id}
                    onClick={() => navigate(`/funds/${fund.id}`)}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium">{fund.no}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{fund.name}</td>
                    <td className="px-3 py-2 text-gray-700">{fund.fund_type}</td>
                    <td className="px-3 py-2 text-gray-700">{fund.fund_manager || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{fund.registration_date || fund.formation_date || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{fund.investment_period_end || '-'}</td>
                    <td className={`px-3 py-2 font-medium ${getRatioClass(fund.investment_period_progress)}`}>
                      {formatPercent(fund.investment_period_progress)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{fund.maturity_date || '-'}</td>
                    <td className="px-3 py-2 text-right">{formatMillion(fund.commitment_total)}</td>
                    <td className="px-3 py-2 text-right">{formatMillion(fund.total_paid_in)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${getRatioClass(fund.paid_in_ratio)}`}>
                      {formatPercent(fund.paid_in_ratio)}
                    </td>
                    <td className="px-3 py-2 text-right">{formatMillion(fund.gp_commitment)}</td>
                    <td className="px-3 py-2 text-right">{formatMillion(fund.total_invested)}</td>
                    <td className="px-3 py-2 text-right">{formatMillion(fund.uninvested)}</td>
                    <td className="px-3 py-2 text-right">{formatMillion(fund.investment_assets)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(fund.company_count)}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(fund.hurdle_rate)}</td>
                    <td className="px-3 py-2 text-gray-700">{fund.remaining_period || '-'}</td>
                  </tr>
                ))}
                <tr className="sticky bottom-0 z-20 border-t-2 border-gray-900 bg-gray-100 font-semibold text-gray-900 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
                  <td className="sticky left-0 z-30 bg-gray-100 px-3 py-2" colSpan={8}>
                    합계
                  </td>
                  <td className="px-3 py-2 text-right">{formatMillion(totals?.commitment_total)}</td>
                  <td className="px-3 py-2 text-right">{formatMillion(totals?.total_paid_in)}</td>
                  <td className="px-3 py-2 text-right">-</td>
                  <td className="px-3 py-2 text-right">{formatMillion(totals?.gp_commitment)}</td>
                  <td className="px-3 py-2 text-right">{formatMillion(totals?.total_invested)}</td>
                  <td className="px-3 py-2 text-right">{formatMillion(totals?.uninvested)}</td>
                  <td className="px-3 py-2 text-right">{formatMillion(totals?.investment_assets)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(totals?.company_count)}</td>
                  <td className="px-3 py-2 text-right">-</td>
                  <td className="px-3 py-2 text-right">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
