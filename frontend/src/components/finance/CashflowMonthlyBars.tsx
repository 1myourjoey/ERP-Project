import { formatKRW } from '../../lib/format'

interface CashflowMonthlyRow {
  year_month: string
  total_inflow: number
  total_outflow: number
  ending_balance: number
  net: number
}

interface CashflowMonthlyBarsProps {
  rows: CashflowMonthlyRow[]
  maxMonthlyAmount: number
}

export default function CashflowMonthlyBars({
  rows,
  maxMonthlyAmount,
}: CashflowMonthlyBarsProps) {
  const safeMax = Math.max(maxMonthlyAmount, 1)

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const inflowWidth = `${(Math.abs(row.total_inflow) / safeMax) * 100}%`
        const outflowWidth = `${(Math.abs(row.total_outflow) / safeMax) * 100}%`

        return (
          <div key={row.year_month} className="finance-flow-row">
            <div className="finance-flow-month">
              <p className="finance-flow-month-label">{row.year_month}</p>
              <p className="finance-flow-month-hint">말잔액 {formatKRW(row.ending_balance)}</p>
            </div>
            <div className="finance-flow-bars">
              <div className="finance-flow-track">
                <div className="finance-flow-track-label">유입 {formatKRW(row.total_inflow)}</div>
                <div className="finance-flow-bar-shell">
                  <div className="finance-flow-bar finance-flow-bar-inflow" style={{ width: inflowWidth }} />
                </div>
              </div>
              <div className="finance-flow-track">
                <div className="finance-flow-track-label">유출 {formatKRW(row.total_outflow)}</div>
                <div className="finance-flow-bar-shell">
                  <div className="finance-flow-bar finance-flow-bar-outflow" style={{ width: outflowWidth }} />
                </div>
              </div>
            </div>
            <div className="finance-flow-net">
              <p className="finance-flow-net-label">순현금</p>
              <p className={`finance-flow-net-value ${row.net < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                {formatKRW(row.net)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
