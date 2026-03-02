import { api } from './client'
import type { FundPerformance } from './legacy'

export async function getFundPerformance(
  fundId: number,
  params?: { as_of_date?: string },
) {
  const { data } = await api.get<FundPerformance>(`/funds/${fundId}/performance`, { params })
  return data
}

export async function getAllFundsPerformance() {
  const { data } = await api.get<Array<Record<string, unknown>>>('/performance/all')
  return data
}
