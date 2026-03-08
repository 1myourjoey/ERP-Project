import { getAnalyticsValueLabel } from './labels'

export function formatAnalyticsValue(value: unknown, type?: string, fieldKey?: string) {
  if (value === null || value === undefined || value === '') return '-'

  const displayLabel = getAnalyticsValueLabel(value, fieldKey)
  if (displayLabel) return displayLabel

  if (type === 'number') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    if (Math.abs(numeric) >= 1000) return numeric.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
    return numeric.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  }

  if (type === 'date' || type === 'datetime') {
    const date = new Date(String(value))
    if (Number.isNaN(date.getTime())) return String(value)
    if (type === 'datetime') {
      return date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('ko-KR')
  }

  if (type === 'boolean') return value ? '예' : '아니오'
  return String(value)
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
