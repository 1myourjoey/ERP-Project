import { formatKRW } from '../../lib/labels'

interface WaterfallSummaryProps {
  total_distributed: number
  lp_return_of_capital: number
  lp_hurdle_return: number
  gp_catch_up: number
  gp_carry: number
  lp_residual: number
}

const WATERFALL_ITEMS = [
  { key: 'total_distributed', label: '총 분배액', tone: 'default' },
  { key: 'lp_return_of_capital', label: 'LP 원금 반환', tone: 'default' },
  { key: 'lp_hurdle_return', label: 'LP 허들 수익', tone: 'default' },
  { key: 'gp_catch_up', label: 'GP 캐치업', tone: 'info' },
  { key: 'gp_carry', label: 'GP 캐리', tone: 'info' },
  { key: 'lp_residual', label: 'LP 잔여', tone: 'default' },
] as const

export default function WaterfallSummary(props: WaterfallSummaryProps) {
  return (
    <div className="space-y-2">
      {WATERFALL_ITEMS.map((item) => (
        <div
          key={item.key}
          className={`finance-waterfall-item ${item.tone === 'info' ? 'finance-waterfall-item-info' : ''}`}
        >
          <p className="finance-waterfall-label">{item.label}</p>
          <p className="finance-waterfall-value">{formatKRW(props[item.key])}</p>
        </div>
      ))}
    </div>
  )
}
