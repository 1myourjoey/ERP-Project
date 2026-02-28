import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  completeComplianceObligation,
  fetchComplianceDashboard,
  fetchComplianceObligations,
  fetchFunds,
  type ComplianceDashboardSummary,
  type ComplianceObligation,
  type Fund,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import PageLoading from '../components/PageLoading'
import EmptyState from '../components/EmptyState'

function statusBadge(row: ComplianceObligation): { label: string; className: string } {
  if (row.status === 'completed') return { label: '완료', className: 'tag tag-green' }
  if (row.status === 'waived') return { label: '면제', className: 'tag tag-gray' }
  if (row.status === 'overdue' || (row.d_day != null && row.d_day < 0)) return { label: '기한초과', className: 'tag tag-red' }
  if (row.d_day != null && row.d_day <= 7) return { label: '임박', className: 'tag tag-amber' }
  return { label: '대기', className: 'tag tag-blue' }
}

function dDayLabel(dDay: number | null | undefined): string {
  if (dDay == null) return '-'
  if (dDay < 0) return `D+${Math.abs(dDay)}`
  if (dDay === 0) return 'D-Day'
  return `D-${dDay}`
}

export default function CompliancePage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [fundFilter, setFundFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [targetRow, setTargetRow] = useState<ComplianceObligation | null>(null)
  const [completedBy, setCompletedBy] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')

  const obligationParams = useMemo(
    () => ({
      fund_id: fundFilter === '' ? undefined : fundFilter,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
    }),
    [fundFilter, statusFilter, categoryFilter],
  )

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })
  const { data: dashboard } = useQuery<ComplianceDashboardSummary>({
    queryKey: ['complianceDashboard'],
    queryFn: fetchComplianceDashboard,
  })
  const { data: obligations = [], isLoading } = useQuery<ComplianceObligation[]>({
    queryKey: ['complianceObligations', obligationParams],
    queryFn: () => fetchComplianceObligations(obligationParams),
  })

  const completeMut = useMutation({
    mutationFn: ({ id, by, note }: { id: number; by: string; note?: string }) =>
      completeComplianceObligation(id, { completed_by: by, evidence_note: note || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceDashboard'] })
      queryClient.invalidateQueries({ queryKey: ['complianceObligations'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-base'] })
      setTargetRow(null)
      setCompletedBy('')
      setEvidenceNote('')
      addToast('success', '의무 이행을 완료 처리했습니다.')
    },
  })

  const adhocNotice = obligations.find((row) => row.rule_code?.startsWith('RPT-E') && row.status !== 'completed' && row.status !== 'waived')

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">컴플라이언스</h2>
          <p className="page-subtitle">규제 의무 이행 상태와 마감 일정을 관리합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card-base">
          <p className="text-xs text-gray-500">기한초과</p>
          <p className="mt-1 text-xl font-semibold text-red-600">{dashboard?.overdue_count ?? 0}건</p>
        </div>
        <div className="card-base">
          <p className="text-xs text-gray-500">이번주 마감</p>
          <p className="mt-1 text-xl font-semibold text-amber-600">{dashboard?.due_this_week ?? 0}건</p>
        </div>
        <div className="card-base">
          <p className="text-xs text-gray-500">이번달 마감</p>
          <p className="mt-1 text-xl font-semibold text-gray-800">{dashboard?.due_this_month ?? 0}건</p>
        </div>
        <div className="card-base">
          <p className="text-xs text-gray-500">완료</p>
          <p className="mt-1 text-xl font-semibold text-emerald-600">{dashboard?.completed_count ?? 0}건</p>
        </div>
      </div>

      <div className="card-base">
        <p className="mb-2 text-xs font-semibold text-gray-600">조합 필터</p>
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded px-2 py-1 text-xs ${fundFilter === '' ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}
            onClick={() => setFundFilter('')}
          >
            전체
          </button>
          {funds.map((fund) => (
            <button
              key={fund.id}
              className={`rounded px-2 py-1 text-xs ${fundFilter === fund.id ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}
              onClick={() => setFundFilter(fund.id)}
            >
              {fund.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
            <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">전체</option>
              <option value="pending">미이행</option>
              <option value="in_progress">진행중</option>
              <option value="overdue">기한초과</option>
              <option value="completed">완료</option>
              <option value="waived">면제</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">카테고리</label>
            <select className="form-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">전체</option>
              <option value="reporting">보고</option>
              <option value="investment_limit">투자제한</option>
              <option value="impairment">손상차손</option>
              <option value="asset_rating">자산등급</option>
            </select>
          </div>
        </div>
      </div>

      {adhocNotice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          수시보고 알림: {adhocNotice.rule_title} · 마감 {adhocNotice.due_date} ({dDayLabel(adhocNotice.d_day)})
        </div>
      )}

      <div className="card-base overflow-auto">
        {isLoading ? (
          <PageLoading />
        ) : obligations.length === 0 ? (
          <EmptyState emoji="📋" message="표시할 컴플라이언스 의무가 없습니다." className="py-8" />
        ) : (
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">마감일</th>
                <th className="px-3 py-2 text-left">D-Day</th>
                <th className="px-3 py-2 text-left">보고유형</th>
                <th className="px-3 py-2 text-left">규제근거</th>
                <th className="px-3 py-2 text-left">대상시스템</th>
                <th className="px-3 py-2 text-left">조합</th>
                <th className="px-3 py-2 text-left">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {obligations.map((row) => {
                const badge = statusBadge(row)
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2"><span className={badge.className}>{badge.label}</span></td>
                    <td className="px-3 py-2">{row.due_date || '-'}</td>
                    <td className="px-3 py-2">{dDayLabel(row.d_day)}</td>
                    <td className="px-3 py-2">{row.rule_title || row.rule_code || '-'}</td>
                    <td className="px-3 py-2">{row.guideline_ref || '-'}</td>
                    <td className="px-3 py-2">{row.target_system || '-'}</td>
                    <td className="px-3 py-2">{row.fund_name || '-'}</td>
                    <td className="px-3 py-2">
                      {row.status === 'completed' || row.status === 'waived' ? (
                        <span className="text-xs text-gray-400">처리완료</span>
                      ) : (
                        <button className="secondary-btn btn-sm" onClick={() => setTargetRow(row)}>완료처리</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {targetRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-gray-900">의무 완료 처리</h3>
            <p className="mb-3 text-xs text-gray-500">{targetRow.rule_title} · 마감 {targetRow.due_date}</p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">완료자</label>
                <input className="form-input" value={completedBy} onChange={(event) => setCompletedBy(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">근거 메모</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={evidenceNote}
                  onChange={(event) => setEvidenceNote(event.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="secondary-btn" onClick={() => setTargetRow(null)}>취소</button>
              <button
                className="primary-btn"
                disabled={completeMut.isPending || !completedBy.trim()}
                onClick={() =>
                  completeMut.mutate({
                    id: targetRow.id,
                    by: completedBy.trim(),
                    note: evidenceNote.trim(),
                  })
                }
              >
                완료처리
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
