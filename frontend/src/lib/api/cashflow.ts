import { api } from './client'

export interface CashFlowItem {
  date: string
  category: string
  description: string
  inflow: number
  outflow: number
  source_id?: number | null
  source_type?: string | null
  is_confirmed: boolean
}

export interface CashFlowMonthlySummary {
  year_month: string
  total_inflow: number
  total_outflow: number
  net: number
  ending_balance: number
}

export interface FundCashflowProjection {
  fund_id: number
  fund_name: string
  current_balance: number
  monthly_summary: CashFlowMonthlySummary[]
  items: CashFlowItem[]
}

export interface FundCashflowOverview {
  fund_id: number
  fund_name: string
  current_balance: number
  next_month_net: number
}

export async function getFundCashflow(
  fundId: number,
  params?: { months_ahead?: number; operating_cost?: number },
) {
  const { data } = await api.get<FundCashflowProjection>(`/funds/${fundId}/cashflow`, { params })
  return data
}

export async function getAllFundsCashflow(params?: { months_ahead?: number }) {
  const { data } = await api.get<FundCashflowOverview[]>('/cashflow/all', { params })
  return data
}
