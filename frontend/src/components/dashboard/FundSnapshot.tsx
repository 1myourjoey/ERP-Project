import { useMemo } from 'react'

import type { DashboardFundSnapshotItem, DashboardFundsSnapshotResponse } from '../../lib/api'
import { formatKRW } from '../../lib/format'

interface FundSnapshotProps {
  rows: DashboardFundSnapshotItem[]
  totals: DashboardFundsSnapshotResponse['totals']
  onOpenFund: (fundId: number) => void
  onOpenFunds: () => void
}

function statusMeta(status: string): { label: string; className: string } {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'forming' || normalized === 'planned') {
    return {
      label: '결성예정',
      className: 'border-[#d4a418] bg-[#fff7d6] text-[#624100]',
    }
  }
  if (normalized === 'dissolved') {
    return {
      label: '해산',
      className: 'border-[#bfa5a7] bg-[#f1e8e9] text-[#6d3e44]',
    }
  }
  if (normalized === 'liquidated') {
    return {
      label: '청산완료',
      className: 'border-[#d8e5fb] bg-white text-[#64748b]',
    }
  }
  return {
    label: '운용중',
    className: 'border-[#c5d8fb] bg-[#f5f9ff] text-[#1a3660]',
  }
}

function contributionTone(rate: number | null): string {
  if (rate == null) return 'bg-[#94a3b8]'
  if (rate >= 70) return 'bg-[#0f1f3d]'
  if (rate >= 40) return 'bg-[#558ef8]'
  return 'bg-[#b68a00]'
}

function rowPriority(row: DashboardFundSnapshotItem): number {
  const statusScore = row.compliance_status === 'danger' ? 1000 : row.compliance_status === 'warning' ? 400 : 0
  return (
    statusScore +
    row.compliance_overdue * 120 +
    row.missing_documents * 40 +
    row.pending_task_count * 12 +
    row.active_workflow_count * 6 +
    Math.round((row.contribution_rate ?? 0) / 10)
  )
}

function summaryTone(value: number, type: 'danger' | 'warning' | 'info'): string {
  if (type === 'danger') {
    return value > 0
      ? 'border-[#bfa5a7] bg-[#f1e8e9] text-[#6d3e44]'
      : 'border-[#d8e5fb] bg-white text-[#64748b]'
  }
  if (type === 'warning') {
    return value > 0
      ? 'border-[#d4a418] bg-[#fff7d6] text-[#624100]'
      : 'border-[#d8e5fb] bg-white text-[#64748b]'
  }
  return value > 0
    ? 'border-[#c5d8fb] bg-[#f5f9ff] text-[#1a3660]'
    : 'border-[#d8e5fb] bg-white text-[#64748b]'
}

function issueMeta(row: DashboardFundSnapshotItem): { label: string; detail: string | null; className: string } {
  if (row.compliance_overdue > 0) {
    return {
      label: `컴플 ${row.compliance_overdue}`,
      detail: row.missing_documents > 0 ? `서류 ${row.missing_documents}` : row.pending_task_count > 0 ? `업무 ${row.pending_task_count}` : null,
      className: 'border-[#bfa5a7] bg-[#f1e8e9] text-[#6d3e44]',
    }
  }
  if (row.missing_documents > 0) {
    return {
      label: `서류 ${row.missing_documents}`,
      detail: row.pending_task_count > 0 ? `업무 ${row.pending_task_count}` : null,
      className: 'border-[#d4a418] bg-[#fff7d6] text-[#624100]',
    }
  }
  if (row.pending_task_count > 0) {
    return {
      label: `업무 ${row.pending_task_count}`,
      detail: row.active_workflow_count > 0 ? `WF ${row.active_workflow_count}` : null,
      className: 'border-[#c5d8fb] bg-[#f5f9ff] text-[#1a3660]',
    }
  }
  return {
    label: '안정',
    detail: null,
    className: 'border-[#d8e5fb] bg-white text-[#64748b]',
  }
}

export default function FundSnapshot({ rows, totals, onOpenFund, onOpenFunds }: FundSnapshotProps) {
  const visibleRows = useMemo(
    () =>
      [...rows]
        .sort((a, b) => {
          const priorityDiff = rowPriority(b) - rowPriority(a)
          if (priorityDiff !== 0) return priorityDiff
          const navDiff = (b.nav || 0) - (a.nav || 0)
          if (navDiff !== 0) return navDiff
          return a.name.localeCompare(b.name, 'ko')
        })
        .slice(0, 6),
    [rows],
  )

  return (
    <section className="card-base h-full min-h-[328px] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#0f1f3d]">펀드 현황</h3>
        <button
          type="button"
          className="inline-flex h-7 items-center rounded-md border border-[#d8e5fb] bg-white px-2.5 text-[11px] font-semibold text-[#1a3660] hover:border-[#c5d8fb] hover:bg-[#f5f9ff]"
          onClick={onOpenFunds}
        >
          투자개요
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-semibold ${summaryTone(totals.active_fund_count, 'info')}`}>
          운용중 {totals.active_fund_count}
        </span>
        <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-semibold ${summaryTone(totals.attention_fund_count, 'danger')}`}>
          관리필요 {totals.attention_fund_count}
        </span>
        <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-semibold ${summaryTone(totals.total_missing_documents, 'warning')}`}>
          미수서류 {totals.total_missing_documents}
        </span>
        <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-semibold ${summaryTone(totals.total_pending_tasks, 'info')}`}>
          미완료업무 {totals.total_pending_tasks}
        </span>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-[#e4e7ee]">
        <table className="w-full table-fixed text-[11px]">
          <colgroup>
            <col className="w-[36%]" />
            <col className="w-[32%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead className="bg-[#f5f9ff] text-[#64748b]">
            <tr>
              <th className="px-2 py-1.5 text-left">조합</th>
              <th className="px-2 py-1.5 text-left">진행현황</th>
              <th className="px-2 py-1.5 text-center">이슈</th>
              <th className="px-2 py-1.5 text-right">NAV</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const status = statusMeta(row.status)
              const issue = issueMeta(row)
              const contributionRate =
                row.contribution_rate == null ? null : Math.max(0, Math.min(100, row.contribution_rate))

              return (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenFund(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenFund(row.id)
                    }
                  }}
                  className="cursor-pointer border-t border-[#eef2f8] hover:bg-[#f8fbff]"
                >
                  <td className="px-2 py-2 align-top">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#0f1f3d]">{row.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                        <span className="text-[10px] text-[#64748b]">LP {row.lp_count}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="space-y-1">
                      <p className="truncate text-[10px] text-[#64748b]">
                        약정 {formatKRW(row.commitment_total, 'eok')} / 납입 {formatKRW(row.paid_in_total, 'eok')}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-12 overflow-hidden rounded-full bg-[#d8e5fb]">
                          <div
                            className={`h-full rounded-full ${contributionTone(contributionRate)}`}
                            style={{ width: `${contributionRate ?? 0}%` }}
                          />
                        </div>
                        <span className="font-data text-[10px] font-semibold text-[#0f1f3d]">
                          {contributionRate == null ? '-' : `${contributionRate}%`}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center align-top">
                    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${issue.className}`}>
                      {issue.label}
                    </span>
                    {issue.detail ? <p className="mt-0.5 text-[9px] text-[#64748b]">{issue.detail}</p> : null}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    <p className="font-data font-semibold text-[#0f1f3d]">{formatKRW(row.nav, 'eok')}</p>
                    <p className="mt-0.5 text-[9px] text-[#64748b]">순자산가치</p>
                  </td>
                </tr>
              )
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-[#64748b]">
                  표시할 조합 현황이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-[#c5d8fb] bg-[#f5f9ff] font-semibold text-[#0f1f3d]">
            <tr>
              <td className="px-2 py-1.5">합계</td>
              <td className="px-2 py-1.5 text-left">
                <div className="text-[10px]">약정 {formatKRW(totals.total_commitment, 'eok')} / 납입 {formatKRW(totals.total_paid_in, 'eok')}</div>
              </td>
              <td className="px-2 py-1.5 text-center">
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] ${summaryTone(totals.total_missing_documents, 'warning')}`}>
                  서류 {totals.total_missing_documents}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right">{formatKRW(totals.total_nav, 'eok')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
