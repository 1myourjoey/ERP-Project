import { api } from './client'

export type ExportDomain = 'fund' | 'investments' | 'transactions' | 'compliance' | 'worklogs'
export type ImportDomain = 'investments' | 'lps' | 'transactions' | 'valuations'

export interface ImportPreviewResponse {
  headers: string[]
  total_rows: number
  valid_rows: number
  error_rows: Array<{ row: number; errors: string[] }>
  preview: Record<string, unknown>[]
}

export interface ImportConfirmResponse {
  imported_count: number
  skipped_count: number
  errors: string[]
}

export async function exportFundSummaryExcel(fundId: number) {
  const { data } = await api.get(`/export/fund/${fundId}`, { responseType: 'blob' })
  return data as Blob
}

export async function exportInvestmentsExcel(params?: { fund_id?: number }) {
  const { data } = await api.get('/export/investments', { params, responseType: 'blob' })
  return data as Blob
}

export async function exportTransactionsExcel(params?: { fund_id?: number }) {
  const { data } = await api.get('/export/transactions', { params, responseType: 'blob' })
  return data as Blob
}

export async function exportComplianceExcel(params: { fund_id: number; year: number; month: number }) {
  const { fund_id, year, month } = params
  const { data } = await api.get(`/export/compliance/${fund_id}`, {
    params: { year, month },
    responseType: 'blob',
  })
  return data as Blob
}

export async function exportWorklogsExcel(params?: { date_from?: string; date_to?: string }) {
  const { data } = await api.get('/export/worklogs', { params, responseType: 'blob' })
  return data as Blob
}

export async function previewExcelImport(file: File, importType: ImportDomain) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('import_type', importType)
  const { data } = await api.post<ImportPreviewResponse>('/import/excel/preview', formData)
  return data
}

export async function confirmExcelImport(file: File, importType: ImportDomain) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('import_type', importType)
  const { data } = await api.post<ImportConfirmResponse>('/import/excel/confirm', formData)
  return data
}
