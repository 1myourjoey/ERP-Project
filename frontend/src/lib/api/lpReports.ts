import { api } from './client'

export interface LPReportGenerateResponse {
  generation_id: number
  attachment_id: number
  download_url: string
  message: string
}

export async function previewLPReportData(
  fundId: number,
  params: { year: number; quarter: number },
) {
  const { data } = await api.get(`/funds/${fundId}/lp-report/preview`, { params })
  return data
}

export async function generateLPReport(
  fundId: number,
  params: { year: number; quarter: number },
) {
  const { data } = await api.post<LPReportGenerateResponse>(`/funds/${fundId}/lp-report/generate`, null, {
    params,
  })
  return data
}
