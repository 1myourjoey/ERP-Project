import type { AnalyticsQueryResponse } from '../api/analytics'
import { getAnalyticsValueLabel } from './labels'

export interface PivotMatrixColumn {
  key: string
  labels: string[]
  measureKey: string
  measureLabel: string
}

export interface PivotMatrixRow {
  key: string
  labels: string[]
  values: Record<string, unknown>
}

export interface PivotMatrixModel {
  rowHeaders: string[]
  columnHeaderDepth: number
  columns: PivotMatrixColumn[]
  rows: PivotMatrixRow[]
  grandTotals: Record<string, unknown>
}

function safeLabel(value: unknown, fieldKey?: string) {
  if (value === null || value === undefined || value === '') return '미지정'
  return getAnalyticsValueLabel(value, fieldKey) ?? String(value)
}

export function buildPivotMatrix(response: AnalyticsQueryResponse): PivotMatrixModel {
  const rowFieldKeys = response.row_fields.map((field) => field.key)
  const rowHeaderLabels = response.row_fields.map((field) => field.label)
  const columnFieldKeys = response.column_fields.map((field) => field.key)
  const valueFieldDefs = response.value_fields

  const columnBuckets = new Map<string, PivotMatrixColumn>()
  const rowBuckets = new Map<string, PivotMatrixRow>()

  response.rows.forEach((rawRow) => {
    const rowLabels = rowFieldKeys.map((key) => safeLabel(rawRow[key], key))
    const rowKey = JSON.stringify(rowLabels)
    const currentRow = rowBuckets.get(rowKey) ?? {
      key: rowKey,
      labels: rowLabels,
      values: {},
    }

    valueFieldDefs.forEach((valueField) => {
      const columnLabels = columnFieldKeys.length > 0
        ? columnFieldKeys.map((key) => safeLabel(rawRow[key], key))
        : ['전체']
      const columnKey = `${JSON.stringify(columnLabels)}::${valueField.key}`
      if (!columnBuckets.has(columnKey)) {
        columnBuckets.set(columnKey, {
          key: columnKey,
          labels: columnLabels,
          measureKey: valueField.key,
          measureLabel: valueField.label,
        })
      }
      currentRow.values[columnKey] = rawRow[valueField.key]
    })

    rowBuckets.set(rowKey, currentRow)
  })

  const columns = Array.from(columnBuckets.values())
  const rows = Array.from(rowBuckets.values())
  const depth = Math.max(1, response.column_fields.length)

  return {
    rowHeaders: rowHeaderLabels,
    columnHeaderDepth: depth,
    columns,
    rows,
    grandTotals: response.grand_totals,
  }
}
