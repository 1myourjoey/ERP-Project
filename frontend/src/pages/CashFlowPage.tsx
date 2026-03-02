import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchFunds, type Fund } from '../lib/api'
import { getAllFundsCashflow, getFundCashflow, type FundCashflowProjection } from '../lib/api/cashflow'
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

  const { data: allSummary = [] } = useQuery({
    queryKey: queryKeys.cashflow.all(monthsAhead),
    queryFn: () => getAllFundsCashflow({ months_ahead: monthsAhead }),
  })

  const { data: projection, isLoading } = useQuery<FundCashflowProjection>({
    queryKey: queryKeys.cashflow.fund(selectedFundId || 0, monthsAhead),
    queryFn: () => getFundCashflow(selectedFundId!, { months_ahead: monthsAhead, operating_cost: operatingCost }),
    enabled: selectedFundId !== null,
  })

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

  return (
    <div className="page-container space-y-4">
      <div className="page-header mb-0">
        <div>
          <h2 className="page-title">현금흐름 예측</h2>
          <p className="page-subtitle">월별 유입/유출/잔액 흐름을 확인하세요.</p>
        </div>
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label>
            <span className="mb-1 block text-xs font-medium text-[var(--theme-text-secondary)]">조합</span>
            <select
              className="form-input"
              value={selectedFundId ?? ''}
              onChange={(event) => setSelectedFundId(event.target.value ? Number(event.target.value) : null)}
            >
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[var(--theme-text-secondary)]">예측 기간</span>
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
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[var(--theme-text-secondary)]">월 운영비(옵션)</span>
            <input
              type="number"
              className="form-input"
              min={0}
              value={operatingCost}
              onChange={(event) => setOperatingCost(Number(event.target.value) || 0)}
            />
          </label>
          <div className="rounded border border-[var(--theme-border)] bg-[var(--theme-bg-elevated)] px-3 py-2">
            <p className="text-xs text-[var(--theme-text-secondary)]">현재 잔액</p>
            <p className="text-lg font-semibold">{formatKRW(projection?.current_balance || 0)}</p>
          </div>
        </div>
      </div>

      <div className="card-base">
        <h3 className="mb-3 text-sm font-semibold text-[var(--theme-text-primary)]">전체 펀드 요약</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {allSummary.map((item) => (
            <button
              key={item.fund_id}
              type="button"
              onClick={() => setSelectedFundId(item.fund_id)}
              className={`rounded border px-3 py-2 text-left transition-colors ${
                selectedFundId === item.fund_id
                  ? 'border-[var(--color-primary)] bg-[var(--theme-hover)]'
                  : 'border-[var(--theme-border)] hover:bg-[var(--theme-hover)]'
              }`}
            >
              <p className="text-xs text-[var(--theme-text-secondary)]">{item.fund_name}</p>
              <p className="text-sm font-semibold">잔액 {formatKRW(item.current_balance)}</p>
              <p className={`text-xs ${item.next_month_net < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                다음월 순액 {formatKRW(item.next_month_net)}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="card-base">
        <h3 className="mb-3 text-sm font-semibold text-[var(--theme-text-primary)]">월별 흐름</h3>
        {isLoading && <p className="text-sm text-[var(--theme-text-secondary)]">불러오는 중...</p>}

        {!isLoading && projection?.monthly_summary?.length ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {projection.monthly_summary.map((row) => {
                const inflowWidth = `${(Math.abs(row.total_inflow) / maxMonthlyAmount) * 100}%`
                const outflowWidth = `${(Math.abs(row.total_outflow) / maxMonthlyAmount) * 100}%`
                return (
                  <div key={row.year_month} className="rounded border border-[var(--theme-border)] p-2.5">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{row.year_month}</span>
                      <span className="text-[var(--theme-text-secondary)]">잔액 {formatKRW(row.ending_balance)}</span>
                    </div>
                    <div className="space-y-1">
                      <div>
                        <div className="mb-0.5 text-[11px] text-[var(--theme-text-secondary)]">유입 {formatKRW(row.total_inflow)}</div>
                        <div className="h-2 rounded bg-[var(--theme-border)]">
                          <div className="h-2 rounded bg-[var(--color-secondary)]" style={{ width: inflowWidth }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-0.5 text-[11px] text-[var(--theme-text-secondary)]">유출 {formatKRW(row.total_outflow)}</div>
                        <div className="h-2 rounded bg-[var(--theme-border)]">
                          <div className="h-2 rounded bg-[var(--color-warning)]" style={{ width: outflowWidth }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="table-head-row">
                    <th className="table-head-cell">월</th>
                    <th className="table-head-cell text-right">유입</th>
                    <th className="table-head-cell text-right">유출</th>
                    <th className="table-head-cell text-right">순액</th>
                    <th className="table-head-cell text-right">월말 잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.monthly_summary.map((row) => (
                    <tr key={`table-${row.year_month}`}>
                      <td className="table-body-cell">{row.year_month}</td>
                      <td className="table-body-cell text-right">{formatKRW(row.total_inflow)}</td>
                      <td className="table-body-cell text-right">{formatKRW(row.total_outflow)}</td>
                      <td className={`table-body-cell text-right ${row.net < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                        {formatKRW(row.net)}
                      </td>
                      <td className="table-body-cell text-right">{formatKRW(row.ending_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!isLoading && (!projection || projection.monthly_summary.length === 0) && (
          <p className="text-sm text-[var(--theme-text-secondary)]">예측 데이터가 없습니다.</p>
        )}

        {lowBalanceMonth && (
          <div className="warning-banner mt-3">
            <div className="info-banner-icon">⚠</div>
            <div className="info-banner-text">
              {lowBalanceMonth.year_month} 잔액 경고: {formatKRW(lowBalanceMonth.ending_balance)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
