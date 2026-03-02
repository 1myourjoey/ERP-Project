import { type ReactNode, useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import EmptyState from '../EmptyState'

export interface Column<T> {
  key: string
  header: string
  priority: 1 | 2 | 3
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  width?: string
  render?: (row: T, index: number) => ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string | number
  loading?: boolean
  emptyMessage?: string
  emptyIcon?: ReactNode
  onRowClick?: (row: T) => void
  mobileCardRender?: (row: T) => ReactNode
  sortKey?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (key: string) => void
  selectable?: boolean
  selectedKeys?: Set<string | number>
  onSelectionChange?: (keys: Set<string | number>) => void
  stickyHeader?: boolean
}

function priorityClass(priority: 1 | 2 | 3) {
  if (priority === 3) return 'hidden lg:table-cell'
  if (priority === 2) return 'hidden md:table-cell'
  return ''
}

function alignClass(align: Column<any>['align']) {
  if (align === 'center') return 'text-center'
  if (align === 'right') return 'text-right'
  return 'text-left'
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = '데이터가 없습니다.',
  emptyIcon,
  onRowClick,
  mobileCardRender,
  sortKey,
  sortDirection,
  onSort,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  stickyHeader = false,
}: DataTableProps<T>) {
  const allSelected = useMemo(
    () => data.length > 0 && data.every((row) => selectedKeys.has(keyExtractor(row))),
    [data, keyExtractor, selectedKeys],
  )

  const toggleRow = (key: string | number, checked: boolean) => {
    const next = new Set(selectedKeys)
    if (checked) next.add(key)
    else next.delete(key)
    onSelectionChange?.(next)
  }

  const toggleAll = (checked: boolean) => {
    if (!onSelectionChange) return
    const next = new Set<string | number>()
    if (checked) {
      for (const row of data) {
        next.add(keyExtractor(row))
      }
    }
    onSelectionChange(next)
  }

  const renderSortIcon = (column: Column<T>) => {
    if (!column.sortable) return null
    if (sortKey !== column.key) return <ArrowUpDown size={13} className="inline ml-1 opacity-60" />
    return sortDirection === 'asc'
      ? <ArrowUp size={13} className="inline ml-1" />
      : <ArrowDown size={13} className="inline ml-1" />
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="skeleton h-12" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <EmptyState
        message={emptyMessage}
        emoji={emptyIcon ? '📭' : undefined}
        className="py-8"
      />
    )
  }

  return (
    <>
      {mobileCardRender && <div className="space-y-2 md:hidden">{data.map((row) => <div key={keyExtractor(row)}>{mobileCardRender(row)}</div>)}</div>}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full">
          <thead className={stickyHeader ? 'sticky top-0 z-10 bg-[var(--theme-bg-elevated)]' : ''}>
            <tr className="table-head-row">
              {selectable && (
                <th className="table-head-cell w-10 text-center">
                  <input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`table-head-cell ${priorityClass(column.priority)} ${alignClass(column.align)} ${column.width || ''}`}
                >
                  <button
                    type="button"
                    className={`inline-flex items-center ${column.sortable ? 'cursor-pointer' : 'cursor-default'}`}
                    onClick={() => column.sortable && onSort?.(column.key)}
                  >
                    {column.header}
                    {renderSortIcon(column)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => {
              const key = keyExtractor(row)
              return (
                <tr
                  key={key}
                  className={`hover:bg-[var(--theme-hover)] ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className="table-body-cell text-center" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key)}
                        onChange={(event) => toggleRow(key, event.target.checked)}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`table-body-cell ${priorityClass(column.priority)} ${alignClass(column.align)}`}
                    >
                      {column.render ? column.render(row, rowIndex) : (row as any)[column.key]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default DataTable

