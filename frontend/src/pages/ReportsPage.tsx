import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
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
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'

interface FilterState {
  report_target: string
  fund_id: number | null
  status: string
}

const REPORT_TARGET_OPTIONS = ['중기부', 'VICS', 'LP', '내부보고', '연차보고', '기타']
const STATUS_OPTIONS = ['예정', '준비중', '제출완료', '확인완료']

const EMPTY_FILTERS: FilterState = {
  report_target: '',
  fund_id: null,
  status: '',
}

const EMPTY_INPUT: RegularReportInput = {
  report_target: '중기부',
  fund_id: null,
  period: '',
  due_date: '',
  status: '예정',
  submitted_date: null,
  task_id: null,
  memo: '',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function dueBadge(report: RegularReport): { text: string; className: string } | null {
  if (report.status === '제출완료' || report.status === '확인완료' || report.status === '전송완료') {
    return { text: '제출 완료', className: 'tag tag-green' }
  }
  if (report.days_remaining == null) return null
  if (report.days_remaining < 0) return { text: `지연 D+${Math.abs(report.days_remaining)}`, className: 'tag tag-red' }
  if (report.days_remaining <= 3) return { text: `D-${report.days_remaining}`, className: 'tag tag-red' }
  if (report.days_remaining <= 7) return { text: `D-${report.days_remaining}`, className: 'tag tag-amber' }
  return { text: `D-${report.days_remaining}`, className: 'tag tag-gray' }
}

export default function ReportsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const location = useLocation()
  const highlightId = ((location.state as { highlightId?: number } | null)?.highlightId) ?? null

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
      addToast('success', '보고 기록을 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RegularReportInput> }) => updateRegularReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularReports'] })
      setEditingId(null)
      setEditForm(null)
      addToast('success', '보고 기록을 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRegularReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularReports'] })
      addToast('success', '보고 기록을 삭제했습니다.')
    },
  })

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
      <h2 className="page-title">📑 보고·공시 관리</h2>
          <p className="page-subtitle">정기/수시 보고 일정과 제출 상태를 관리합니다.</p>
        </div>
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">보고 대상</label>
            <select value={filters.report_target} onChange={(e) => setFilters((prev) => ({ ...prev, report_target: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-2 py-1 text-sm">
              <option value="">전체 대상</option>
              {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{target}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
            <select value={filters.fund_id || ''} onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="w-full rounded-xl border border-gray-200 px-2 py-1 text-sm">
              <option value="">전체 조합</option>
              {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
            <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-2 py-1 text-sm">
              <option value="">전체 상태</option>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="secondary-btn">필터 초기화</button>
          <button onClick={() => setShowCreate((prev) => !prev)} className="primary-btn">+ 보고 기록 추가</button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">신규 보고 기록</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">보고 대상</label>
              <select value={newReport.report_target} onChange={(e) => setNewReport((prev) => ({ ...prev, report_target: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">
                {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{target}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
              <select value={newReport.fund_id || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="w-full rounded border px-2 py-1 text-sm">
                <option value="">조합 미지정</option>
                {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">기간</label>
              <input value={newReport.period} onChange={(e) => setNewReport((prev) => ({ ...prev, period: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm" placeholder="예: 2026-Q1" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">마감일</label>
              <input type="date" value={newReport.due_date || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, due_date: e.target.value || null }))} className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
              <select value={newReport.status || '예정'} onChange={(e) => setNewReport((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded border px-2 py-1 text-sm">
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">메모</label>
            <textarea value={newReport.memo || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, memo: e.target.value }))} rows={3} className="w-full rounded border px-2 py-1 text-sm" placeholder="선택 입력" />
          </div>
          <div className="flex gap-2">
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
              className="primary-btn"
            >
              저장
            </button>
            <button onClick={() => setShowCreate(false)} className="secondary-btn">취소</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <PageLoading />
        ) : !rows?.length ? (
          <EmptyState emoji="📑" message="보고 기록이 없어요" action={() => setShowCreate(true)} actionLabel="보고 등록" />
        ) : (
          rows.map((row) => {
            const badge = dueBadge(row)
            const isEditing = editingId === row.id && !!editForm
            return (
              <div key={row.id} className={`card-base ${highlightId === row.id ? 'ring-2 ring-blue-300' : ''}`}>
                {isEditing && editForm ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                      <div><label className="mb-1 block text-xs font-medium text-gray-600">보고 대상</label><select value={editForm.report_target} onChange={(e) => setEditForm((prev) => prev ? { ...prev, report_target: e.target.value } : prev)} className="w-full rounded border px-2 py-1 text-sm">{REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{target}</option>)}</select></div>
                      <div><label className="mb-1 block text-xs font-medium text-gray-600">조합</label><select value={editForm.fund_id || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, fund_id: Number(e.target.value) || null } : prev)} className="w-full rounded border px-2 py-1 text-sm"><option value="">조합 미지정</option>{funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></div>
                      <div><label className="mb-1 block text-xs font-medium text-gray-600">기간</label><input value={editForm.period} onChange={(e) => setEditForm((prev) => prev ? { ...prev, period: e.target.value } : prev)} className="w-full rounded border px-2 py-1 text-sm" /></div>
                      <div><label className="mb-1 block text-xs font-medium text-gray-600">마감일</label><input type="date" value={editForm.due_date || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, due_date: e.target.value || null } : prev)} className="w-full rounded border px-2 py-1 text-sm" /></div>
                      <div><label className="mb-1 block text-xs font-medium text-gray-600">상태</label><select value={editForm.status || '예정'} onChange={(e) => setEditForm((prev) => prev ? { ...prev, status: e.target.value } : prev)} className="w-full rounded border px-2 py-1 text-sm">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div><label className="mb-1 block text-xs font-medium text-gray-600">제출일</label><input type="date" value={editForm.submitted_date || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, submitted_date: e.target.value || null } : prev)} className="w-full rounded border px-2 py-1 text-sm" /></div>
                      <div><label className="mb-1 block text-xs font-medium text-gray-600">메모</label><textarea value={editForm.memo || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, memo: e.target.value } : prev)} rows={3} className="w-full rounded border px-2 py-1 text-sm" /></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateMut.mutate({ id: row.id, data: { ...editForm, period: editForm.period.trim(), memo: editForm.memo?.trim() || null } })} className="primary-btn">저장</button>
                      <button onClick={() => { setEditingId(null); setEditForm(null) }} className="secondary-btn">취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">{row.report_target} · {row.period}</p>
                      <div className="flex items-center gap-1">
                      {badge && <span className={badge.className}>{badge.text}</span>}
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{labelStatus(row.status)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">조합: {row.fund_name || '미지정'} | 마감일: {formatDate(row.due_date)} | 제출일: {formatDate(row.submitted_date)}</p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">메모</label>
                      <textarea value={row.memo || ''} readOnly rows={3} className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700" />
                    </div>
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
                        className="secondary-btn"
                      >
                        수정
                      </button>
                      <button onClick={() => { if (confirm('이 보고 기록을 삭제하시겠습니까?')) deleteMut.mutate(row.id) }} className="danger-btn">삭제</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

