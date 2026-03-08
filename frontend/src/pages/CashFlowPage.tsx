import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'

import PageLoading from '../components/PageLoading'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import WorkbenchSplit from '../components/common/page/WorkbenchSplit'
import CashflowMonthlyBars from '../components/finance/CashflowMonthlyBars'
import { fetchFunds, type Fund } from '../lib/api'
import {
  getAllFundsCashflow,
  getFundCashflow,
  type FundCashflowOverview,
  type FundCashflowProjection,
} from '../lib/api/cashflow'
import { formatKRW } from '../lib/format'
import { queryKeys } from '../lib/queryKeys'

const MONTH_OPTIONS = [6, 12, 18, 24]

export default function CashFlowPage() {
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null)
  const [monthsAhead, setMonthsAhead] = useState<number>(12)
  const [operatingCost, setOperatingCost] = useState<number>(0)

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: queryKeys.funds.list(),
    queryFn: fetchFunds,
  })

  useEffect(() => {
    if (!selectedFundId && funds.length > 0) {
      setSelectedFundId(funds[0].id)
    }
  }, [funds, selectedFundId])

  const { data: allSummary = [] } = useQuery<FundCashflowOverview[]>({
    queryKey: queryKeys.cashflow.all(monthsAhead),
    queryFn: () => getAllFundsCashflow({ months_ahead: monthsAhead }),
  })

  const { data: projection, isLoading } = useQuery<FundCashflowProjection>({
    queryKey: queryKeys.cashflow.fund(selectedFundId || 0, monthsAhead),
    queryFn: () => getFundCashflow(selectedFundId!, { months_ahead: monthsAhead, operating_cost: operatingCost }),
    enabled: selectedFundId !== null,
  })

  const selectedFund = funds.find((fund) => fund.id === selectedFundId) ?? null
  const nextMonthRow = projection?.monthly_summary?.[0] ?? null

  const maxMonthlyAmount = useMemo(() => {
    if (!projection?.monthly_summary?.length) return 0
    return Math.max(
      ...projection.monthly_summary.map((row) => Math.max(Math.abs(row.total_inflow), Math.abs(row.total_outflow))),
      1,
    )
  }, [projection?.monthly_summary])

  const lowBalanceMonth = useMemo(() => {
    return projection?.monthly_summary?.find((row) => row.ending_balance <= 500_000_000) || null
  }, [projection?.monthly_summary])

  const maxOutflowMonth = useMemo(() => {
    if (!projection?.monthly_summary?.length) return null
    return projection.monthly_summary.reduce((current, row) =>
      Math.abs(row.total_outflow) > Math.abs(current.total_outflow) ? row : current,
    )
  }, [projection?.monthly_summary])

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="현금흐름 예측"
        subtitle="조합별 월간 유입, 유출, 말잔액 흐름을 같은 작업대에서 비교하고 저잔액 구간을 빠르게 확인합니다."
      />

      <PageMetricStrip
        items={[
          {
            label: '현재 잔액',
            value: formatKRW(projection?.current_balance || 0),
            hint: selectedFund?.name || '조합 선택 대기',
            tone: 'info',
          },
          {
            label: '예측 기간',
            value: `${monthsAhead}개월`,
            hint: '월별 현금흐름 예측',
            tone: 'default',
          },
          {
            label: '운영비 옵션',
            value: formatKRW(operatingCost),
            hint: '월별 추가 비용 반영',
            tone: 'default',
          },
          {
            label: '저잔액 경고',
            value: lowBalanceMonth ? lowBalanceMonth.year_month : '없음',
            hint: lowBalanceMonth ? formatKRW(lowBalanceMonth.ending_balance) : '안정 구간',
            tone: lowBalanceMonth ? 'warning' : 'success',
          },
        ]}
      />

      <PageControlStrip compact>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,300px)_160px_180px_minmax(0,1fr)] lg:items-end">
          <div>
            <label className="form-label">조합</label>
            <select
              className="form-input"
              value={selectedFundId ?? ''}
              onChange={(event) => setSelectedFundId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">조합 선택</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">예측 기간</label>
            <select
              className="form-input"
              value={monthsAhead}
              onChange={(event) => setMonthsAhead(Number(event.target.value) || 12)}
            >
              {MONTH_OPTIONS.map((month) => (
                <option key={month} value={month}>
                  {month}개월
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">월 운영비 보정</label>
            <input
              type="number"
              className="form-input"
              min={0}
              value={operatingCost}
              onChange={(event) => setOperatingCost(Number(event.target.value) || 0)}
            />
          </div>
          <div className="finance-kpi-inline">
            <div className="finance-kpi-card">
              <p className="finance-kpi-label">선택 조합</p>
              <p className="finance-kpi-value">{selectedFund?.name || '-'}</p>
              <p className="finance-kpi-hint">예측 결과와 하단 상세표를 동시에 갱신합니다.</p>
            </div>
          </div>
        </div>
      </PageControlStrip>

      <SectionScaffold
        title="전체 조합 요약"
        description="현재 잔액과 다음 달 순현금을 한 줄로 비교해 조합별 현금 여력을 빠르게 점검합니다."
      >
        {!allSummary.length ? (
          <div className="finance-empty">현금흐름 요약 데이터가 없습니다.</div>
        ) : (
          <div className="compact-table-wrap">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="table-head-row">
                <tr>
                  <th className="table-head-cell">조합</th>
                  <th className="table-head-cell text-right">현재 잔액</th>
                  <th className="table-head-cell text-right">다음 달 순현금</th>
                  <th className="table-head-cell text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {allSummary.map((item) => {
                  const isSelected = selectedFundId === item.fund_id
                  return (
                    <tr
                      key={item.fund_id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-[#f5f9ff]' : 'hover:bg-[#f5f9ff]'}`}
                      onClick={() => setSelectedFundId(item.fund_id)}
                    >
                      <td className="table-body-cell font-medium text-[#0f1f3d]">{item.fund_name}</td>
                      <td className="table-body-cell text-right font-data">{formatKRW(item.current_balance)}</td>
                      <td className={`table-body-cell text-right font-data ${item.next_month_net < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                        {formatKRW(item.next_month_net)}
                      </td>
                      <td className="table-body-cell text-center">
                        <span className={`finance-status-pill ${item.next_month_net < 0 ? 'finance-status-warning' : 'finance-status-success'}`}>
                          {item.next_month_net < 0 ? '유출 우세' : '안정'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionScaffold>

      <WorkbenchSplit
        primary={
          <SectionScaffold
            title="월별 현금흐름"
            description="월별 유입·유출과 말잔액 변화를 같은 축에서 비교합니다."
          >
            {isLoading ? (
              <PageLoading />
            ) : projection?.monthly_summary?.length ? (
              <CashflowMonthlyBars rows={projection.monthly_summary} maxMonthlyAmount={maxMonthlyAmount} />
            ) : (
              <div className="finance-empty">선택한 조건에 대한 예측 데이터가 없습니다.</div>
            )}
          </SectionScaffold>
        }
        secondary={
          <SectionScaffold title="위험 요약" description="저잔액 도달 시점과 월별 최대 유출 구간을 함께 확인합니다.">
            <div className="space-y-2">
              <div className="finance-kpi-card">
                <p className="finance-kpi-label">선택 조합</p>
                <p className="finance-kpi-value">{selectedFund?.name || '-'}</p>
                <p className="finance-kpi-hint">현재 잔액 {formatKRW(projection?.current_balance || 0)}</p>
              </div>
              <div className="finance-kpi-card">
                <p className="finance-kpi-label">다음 달 순현금</p>
                <p className={`finance-kpi-value ${nextMonthRow && nextMonthRow.net < 0 ? 'text-[var(--color-danger)]' : ''}`}>
                  {nextMonthRow ? formatKRW(nextMonthRow.net) : '-'}
                </p>
                <p className="finance-kpi-hint">{nextMonthRow ? `${nextMonthRow.year_month} 기준` : '예측 대기'}</p>
              </div>
              <div className="finance-kpi-card">
                <p className="finance-kpi-label">최대 유출 월</p>
                <p className="finance-kpi-value">{maxOutflowMonth?.year_month || '-'}</p>
                <p className="finance-kpi-hint">{maxOutflowMonth ? formatKRW(maxOutflowMonth.total_outflow) : '유출 데이터 없음'}</p>
              </div>
              <div className="finance-kpi-card">
                <p className="finance-kpi-label">저잔액 도달</p>
                <p className={`finance-kpi-value ${lowBalanceMonth ? 'text-[var(--color-danger)]' : ''}`}>
                  {lowBalanceMonth?.year_month || '없음'}
                </p>
                <p className="finance-kpi-hint">{lowBalanceMonth ? formatKRW(lowBalanceMonth.ending_balance) : '예상 구간 내 안정'}</p>
              </div>
            </div>

            {lowBalanceMonth ? (
              <div className="warning-banner mt-3">
                <div className="info-banner-icon">
                  <AlertTriangle size={14} />
                </div>
                <div className="info-banner-text">
                  {lowBalanceMonth.year_month}에 저잔액 경고가 예상됩니다. 예상 말잔액 {formatKRW(lowBalanceMonth.ending_balance)}
                </div>
              </div>
            ) : null}
          </SectionScaffold>
        }
        secondarySticky
      />

      <SectionScaffold
        title="월별 상세 테이블"
        description="예측 계산값을 표로 비교해 월별 순현금과 말잔액을 검토합니다."
      >
        {isLoading ? (
          <PageLoading />
        ) : !projection?.monthly_summary?.length ? (
          <div className="finance-empty">표시할 월별 상세 데이터가 없습니다.</div>
        ) : (
          <div className="compact-table-wrap">
            <table className="min-w-[880px] w-full text-sm">
              <thead className="table-head-row">
                <tr>
                  <th className="table-head-cell">월</th>
                  <th className="table-head-cell text-right">유입</th>
                  <th className="table-head-cell text-right">유출</th>
                  <th className="table-head-cell text-right">순현금</th>
                  <th className="table-head-cell text-right">말잔액</th>
                </tr>
              </thead>
              <tbody>
                {projection.monthly_summary.map((row) => (
                  <tr key={`table-${row.year_month}`}>
                    <td className="table-body-cell">{row.year_month}</td>
                    <td className="table-body-cell text-right font-data">{formatKRW(row.total_inflow)}</td>
                    <td className="table-body-cell text-right font-data">{formatKRW(row.total_outflow)}</td>
                    <td className={`table-body-cell text-right font-data ${row.net < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                      {formatKRW(row.net)}
                    </td>
                    <td className="table-body-cell text-right font-data">{formatKRW(row.ending_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionScaffold>
    </div>
  )
}
