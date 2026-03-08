import type { AnalyticsQueryResponse } from '../api/analytics'
import { formatAnalyticsValue } from './formatters'

export interface ExecutiveMetricItem {
  key: string
  label: string
  value: number
}

export interface ExecutiveSeriesItem {
  key: string
  label: string
  color: string
}

export interface ExecutiveCartesianData {
  categoryLabel: string
  data: Array<Record<string, string | number>>
  series: ExecutiveSeriesItem[]
}

export interface ExecutiveDonutSlice {
  key: string
  label: string
  value: number
  color: string
}

const CHART_COLORS = ['#0f1f3d', '#558ef8', '#7ea3f4', '#b68a00', '#6d3e44', '#2d6a53', '#94a3b8', '#4f6ca7']

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function buildCategoryLabel(response: AnalyticsQueryResponse, row: Record<string, unknown>) {
  if (response.row_fields.length === 0) return '전체'
  return response.row_fields
    .map((field) => formatAnalyticsValue(row[field.key], field.data_type, field.key))
    .join(' · ')
}

function buildColumnLabel(response: AnalyticsQueryResponse, row: Record<string, unknown>) {
  if (response.column_fields.length === 0) return ''
  return response.column_fields
    .map((field) => formatAnalyticsValue(row[field.key], field.data_type, field.key))
    .join(' · ')
}

export function getExecutiveSeriesColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length]
}

export function toExecutiveMetrics(response?: AnalyticsQueryResponse | null): ExecutiveMetricItem[] {
  if (!response) return []
  const source = response.rows[0] ?? response.grand_totals
  return response.value_fields.map((field) => ({
    key: field.key,
    label: field.label,
    value: toNumber(source?.[field.key]),
  }))
}

export function toExecutiveCartesianData(response?: AnalyticsQueryResponse | null): ExecutiveCartesianData {
  if (!response) return { categoryLabel: '', data: [], series: [] }

  const dataMap = new Map<string, Record<string, string | number>>()
  const seriesMap = new Map<string, ExecutiveSeriesItem>()

  response.rows.forEach((row) => {
    const category = buildCategoryLabel(response, row)
    const columnLabel = buildColumnLabel(response, row)
    const bucket = dataMap.get(category) ?? { category }

    response.value_fields.forEach((valueField, valueIndex) => {
      const key = columnLabel ? `${columnLabel}__${valueField.key}` : valueField.key
      const label = columnLabel
        ? response.value_fields.length > 1
          ? `${columnLabel} · ${valueField.label}`
          : columnLabel
        : valueField.label

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          key,
          label,
          color: getExecutiveSeriesColor(seriesMap.size + valueIndex),
        })
      }

      bucket[key] = toNumber(row[valueField.key])
    })

    dataMap.set(category, bucket)
  })

  return {
    categoryLabel: response.row_fields[0]?.label ?? '구분',
    data: Array.from(dataMap.values()),
    series: Array.from(seriesMap.values()),
  }
}

export function toExecutiveDonutData(response?: AnalyticsQueryResponse | null): ExecutiveDonutSlice[] {
  if (!response) return []
  const valueField = response.value_fields[0]
  if (!valueField) return []

  const raw = response.rows.map((row, index) => ({
    key: String(index),
    label: buildCategoryLabel(response, row),
    value: toNumber(row[valueField.key]),
  }))
  const nonZero = raw.filter((item) => item.value > 0).sort((a, b) => b.value - a.value)
  const limited = nonZero.slice(0, 7).map((item, index) => ({
    ...item,
    color: getExecutiveSeriesColor(index),
  }))

  if (nonZero.length > 7) {
    limited.push({
      key: 'others',
      label: '기타',
      value: nonZero.slice(7).reduce((sum, item) => sum + item.value, 0),
      color: getExecutiveSeriesColor(7),
    })
  }

  return limited
}

export function toExecutiveTableData(response?: AnalyticsQueryResponse | null) {
  if (!response) {
    return { columns: [] as Array<{ key: string; label: string; type: string }>, rows: [] as Record<string, unknown>[] }
  }

  if (response.table_fields.length > 0) {
    return {
      columns: response.table_fields.map((field) => ({ key: field.key, label: field.label, type: field.data_type })),
      rows: response.rows,
    }
  }

  const columns = [
    ...response.row_fields.map((field) => ({ key: field.key, label: field.label, type: field.data_type })),
    ...response.column_fields.map((field) => ({ key: field.key, label: field.label, type: field.data_type })),
    ...response.value_fields.map((field) => ({ key: field.key, label: field.label, type: field.data_type })),
  ]

  return { columns, rows: response.rows }
}
