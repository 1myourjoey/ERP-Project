import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createRegularReport,
  deleteRegularReport,
  fetchFunds,
  fetchRegularReports,
  updateRegularReport,
  type Fund,
  type RegularReport,
  type RegularReportInput,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'

interface FilterState {
  report_target: string
  fund_id: number | null
  status: string
}

const REPORT_TARGET_OPTIONS = ['농금원', 'VICS', 'LP', '내부보고회', '홈택스']
const REPORT_TARGET_LABEL: Record<string, string> = {
  농금원: '농금원',
  VICS: '벤처협회 VICS',
  LP: 'LP 보고',
  내부보고회: '내부보고회',
  홈택스: '홈택스',
}
const STATUS_OPTIONS = ['미작성', '작성중', '검수중', '전송완료', '실패']

const EMPTY_FILTERS: FilterState = {
  report_target: '',
  fund_id: null,
  status: '',
}

const EMPTY_INPUT: RegularReportInput = {
  report_target: '농금원',
  fund_id: null,
  period: '',
  due_date: '',
  status: '미작성',
  submitted_date: null,
  task_id: null,
  memo: '',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function dueBadge(report: RegularReport): { text: string; className: string } | null {
  if (report.status === '전송완료') {
    return { text: '완료', className: 'bg-green-100 text-green-700' }
  }
  if (report.days_remaining == null) return null
  if (report.days_remaining < 0) {
    return { text: `지연 D+${Math.abs(report.days_remaining)}`, className: 'bg-red-200 text-red-800' }
  }
  if (report.days_remaining <= 3) {
    return { text: `D-${report.days_remaining}`, className: 'bg-red-100 text-red-700' }
  }
  if (report.days_remaining <= 7) {
    return { text: `D-${report.days_remaining}`, className: 'bg-yellow-100 text-yellow-700' }
  }
  return { text: `D-${report.days_remaining}`, className: 'bg-slate-100 text-slate-700' }
}

export default function ReportsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [showCreate, setShowCreate] = useState(false)
  const [newReport, setNewReport] = useState<RegularReportInput>(EMPTY_INPUT)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<RegularReportInput | null>(null)

  const params = useMemo(
    () => ({
      report_target: filters.report_target || undefined,
      fund_id: filters.fund_id || undefined,
      status: filters.status || undefined,
    }),
    [filters],
  )

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: rows, isLoading } = useQuery<RegularReport[]>({
    queryKey: ['regularReports', params],
    queryFn: () => fetchRegularReports(params),
  })

  const createMut = useMutation({
    mutationFn: (data: RegularReportInput) => createRegularReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularReports'] })
      setShowCreate(false)
      setNewReport(EMPTY_INPUT)
      addToast('success', '보고공시를 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RegularReportInput> }) => updateRegularReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularReports'] })
      setEditingId(null)
      setEditForm(null)
      addToast('success', '보고공시를 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRegularReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularReports'] })
      addToast('success', '보고공시를 삭제했습니다.')
    },
  })

  const fundMap = useMemo(() => new Map((funds || []).map((fund) => [fund.id, fund.name])), [funds])

  return (
    <div className="max-w-7xl p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">보고공시 관리</h2>
          <p className="mt-1 text-sm text-slate-500">농금원/VICS 월보고, LP보고, 내부보고회 관리</p>
        </div>
        <button onClick={() => setShowCreate((prev) => !prev)} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">
          + 신규 등록
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">필터</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <select value={filters.report_target} onChange={(e) => setFilters((prev) => ({ ...prev, report_target: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            <option value="">전체 대상</option>
            {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{REPORT_TARGET_LABEL[target] || target}</option>)}
          </select>
          <select value={filters.fund_id || ''} onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="rounded border px-2 py-1 text-sm">
            <option value="">전체 조합</option>
            {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            <option value="">전체 상태</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <button onClick={() => setFilters(EMPTY_FILTERS)} className="mt-2 rounded border px-2 py-1 text-xs hover:bg-slate-100">
          필터 초기화
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">신규 보고공시 등록</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select value={newReport.report_target} onChange={(e) => setNewReport((prev) => ({ ...prev, report_target: e.target.value }))} className="rounded border px-2 py-1 text-sm">
              {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{REPORT_TARGET_LABEL[target] || target}</option>)}
            </select>
            <select value={newReport.fund_id || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="rounded border px-2 py-1 text-sm">
              <option value="">전체 대상(조합 미지정)</option>
              {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
            <input value={newReport.period} onChange={(e) => setNewReport((prev) => ({ ...prev, period: e.target.value }))} className="rounded border px-2 py-1 text-sm" placeholder="기간 (예: 2026-01)" />
            <input type="date" value={newReport.due_date || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, due_date: e.target.value || null }))} className="rounded border px-2 py-1 text-sm" />
            <input value={newReport.memo || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, memo: e.target.value }))} className="rounded border px-2 py-1 text-sm" placeholder="비고" />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                if (!newReport.report_target || !newReport.period.trim()) return
                createMut.mutate({
                  ...newReport,
                  period: newReport.period.trim(),
                  memo: newReport.memo?.trim() || null,
                })
              }}
              disabled={createMut.isPending}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              저장
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded border bg-white px-3 py-1 text-xs hover:bg-slate-100">
              취소
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {isLoading ? (
          <p className="p-2 text-sm text-slate-500">불러오는 중...</p>
        ) : !rows?.length ? (
          <p className="p-2 text-sm text-slate-400">보고공시가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="px-2 py-2">보고대상</th>
                  <th className="px-2 py-2">조합</th>
                  <th className="px-2 py-2">기간</th>
                  <th className="px-2 py-2">마감일</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">전송일</th>
                  <th className="px-2 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const badge = dueBadge(row)
                  return (
                    <tr key={row.id} className="border-b align-top">
                      <td className="px-2 py-2">{REPORT_TARGET_LABEL[row.report_target] || row.report_target}</td>
                      <td className="px-2 py-2">{row.fund_name || (row.fund_id ? fundMap.get(row.fund_id) : '전체')}</td>
                      <td className="px-2 py-2">{row.period}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span>{formatDate(row.due_date)}</span>
                          {badge && <span className={`rounded px-2 py-0.5 text-xs ${badge.className}`}>{badge.text}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.status}
                          onChange={(e) => updateMut.mutate({ id: row.id, data: { status: e.target.value } })}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">{formatDate(row.submitted_date)}</td>
                      <td className="px-2 py-2">
                        {editingId === row.id && editForm ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                              <input value={editForm.period} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, period: e.target.value } : prev))} className="rounded border px-2 py-1 text-xs" placeholder="기간" />
                              <input type="date" value={editForm.due_date || ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, due_date: e.target.value || null } : prev))} className="rounded border px-2 py-1 text-xs" />
                              <input type="date" value={editForm.submitted_date || ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, submitted_date: e.target.value || null } : prev))} className="rounded border px-2 py-1 text-xs" />
                              <input value={editForm.memo || ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, memo: e.target.value } : prev))} className="rounded border px-2 py-1 text-xs" placeholder="비고" />
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  updateMut.mutate({
                                    id: row.id,
                                    data: {
                                      ...editForm,
                                      period: editForm.period.trim(),
                                      memo: editForm.memo?.trim() || null,
                                    },
                                  })
                                }}
                                className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                              >
                                저장
                              </button>
                              <button onClick={() => { setEditingId(null); setEditForm(null) }} className="rounded border px-2 py-1 text-xs hover:bg-slate-100">
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingId(row.id)
                                setEditForm({
                                  report_target: row.report_target,
                                  fund_id: row.fund_id,
                                  period: row.period,
                                  due_date: row.due_date,
                                  status: row.status,
                                  submitted_date: row.submitted_date,
                                  task_id: row.task_id,
                                  memo: row.memo,
                                })
                              }}
                              className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('이 보고공시를 삭제하시겠습니까?')) deleteMut.mutate(row.id)
                              }}
                              className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
