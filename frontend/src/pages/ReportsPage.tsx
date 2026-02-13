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
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'

interface FilterState {
  report_target: string
  fund_id: number | null
  status: string
}

const REPORT_TARGET_OPTIONS = ['농금원', 'VICS', 'LP', '내부보고회', '홈택스', '금감원', '한국벤처캐피탈협회', '기타']
const REPORT_TARGET_LABEL: Record<string, string> = {
  농금원: '농금원',
  VICS: '벤처협회 VICS',
  LP: 'LP 보고',
  내부보고회: '내부보고회',
  홈택스: '홈택스',
  금감원: '금감원',
  한국벤처캐피탈협회: '한국벤처캐피탈협회',
  기타: '기타',
}
const STATUS_OPTIONS = ['예정', '준비중', '제출완료', '확인완료']

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
    return { text: '제출 완료', className: 'bg-green-100 text-green-700' }
  }
  if (report.days_remaining == null) return null
  if (report.days_remaining < 0) return { text: `지연 D+${Math.abs(report.days_remaining)}`, className: 'bg-red-100 text-red-700' }
  if (report.days_remaining <= 3) return { text: `D-${report.days_remaining}`, className: 'bg-red-100 text-red-700' }
  if (report.days_remaining <= 7) return { text: `D-${report.days_remaining}`, className: 'bg-amber-100 text-amber-700' }
  return { text: `D-${report.days_remaining}`, className: 'bg-gray-100 text-gray-700' }
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
    <div className="max-w-7xl p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-gray-900">보고·공시 관리</h2>
        <p className="text-sm text-gray-500">정기/수시 보고 일정과 현황을 기록합니다.</p>
        <p className="text-xs text-gray-400">(실제 보고는 농금원 ERP, VICS 등 각 기관 시스템에서 진행)</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <select value={filters.report_target} onChange={(e) => setFilters((prev) => ({ ...prev, report_target: e.target.value }))} className="rounded-xl border border-gray-200 px-2 py-1 text-sm">
            <option value="">전체 대상</option>
            {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{REPORT_TARGET_LABEL[target] || target}</option>)}
          </select>
          <select value={filters.fund_id || ''} onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="rounded-xl border border-gray-200 px-2 py-1 text-sm">
            <option value="">전체 조합</option>
            {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="rounded-xl border border-gray-200 px-2 py-1 text-sm">
            <option value="">전체 상태</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-100">필터 초기화</button>
          <button onClick={() => setShowCreate((prev) => !prev)} className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">+ 보고 기록 추가</button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">신규 보고 기록</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select value={newReport.report_target} onChange={(e) => setNewReport((prev) => ({ ...prev, report_target: e.target.value }))} className="rounded border px-2 py-1 text-sm">
              {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{REPORT_TARGET_LABEL[target] || target}</option>)}
            </select>
            <select value={newReport.fund_id || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="rounded border px-2 py-1 text-sm">
              <option value="">조합 미지정</option>
              {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
            <input value={newReport.period} onChange={(e) => setNewReport((prev) => ({ ...prev, period: e.target.value }))} className="rounded border px-2 py-1 text-sm" placeholder="기간 (예: 2026-Q1)" />
            <input type="date" value={newReport.due_date || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, due_date: e.target.value || null }))} className="rounded border px-2 py-1 text-sm" />
            <select value={newReport.status || '예정'} onChange={(e) => setNewReport((prev) => ({ ...prev, status: e.target.value }))} className="rounded border px-2 py-1 text-sm">
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <textarea value={newReport.memo || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, memo: e.target.value }))} rows={4} className="w-full rounded border px-2 py-1 text-sm" placeholder="메모 (예: 향후 자료 전달 예정, 별도 ERP 제출 예정 등)" />
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
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              저장
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded border bg-white px-3 py-1 text-xs hover:bg-gray-100">취소</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-sm">불러오는 중...</div>
        ) : !rows?.length ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-400 shadow-sm">보고 기록이 없습니다.</div>
        ) : (
          rows.map((row) => {
            const badge = dueBadge(row)
            const isEditing = editingId === row.id && !!editForm
            return (
              <div key={row.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                {isEditing && editForm ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                      <select value={editForm.report_target} onChange={(e) => setEditForm((prev) => prev ? { ...prev, report_target: e.target.value } : prev)} className="rounded border px-2 py-1 text-sm">
                        {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{REPORT_TARGET_LABEL[target] || target}</option>)}
                      </select>
                      <select value={editForm.fund_id || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, fund_id: Number(e.target.value) || null } : prev)} className="rounded border px-2 py-1 text-sm">
                        <option value="">조합 미지정</option>
                        {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                      </select>
                      <input value={editForm.period} onChange={(e) => setEditForm((prev) => prev ? { ...prev, period: e.target.value } : prev)} className="rounded border px-2 py-1 text-sm" />
                      <input type="date" value={editForm.due_date || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, due_date: e.target.value || null } : prev)} className="rounded border px-2 py-1 text-sm" />
                      <select value={editForm.status || '예정'} onChange={(e) => setEditForm((prev) => prev ? { ...prev, status: e.target.value } : prev)} className="rounded border px-2 py-1 text-sm">
                        {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <input type="date" value={editForm.submitted_date || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, submitted_date: e.target.value || null } : prev)} className="rounded border px-2 py-1 text-sm" />
                      <textarea value={editForm.memo || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, memo: e.target.value } : prev)} rows={3} className="rounded border px-2 py-1 text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateMut.mutate({ id: row.id, data: { ...editForm, period: editForm.period.trim(), memo: editForm.memo?.trim() || null } })} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">저장</button>
                      <button onClick={() => { setEditingId(null); setEditForm(null) }} className="rounded border px-3 py-1 text-xs hover:bg-gray-100">취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">{REPORT_TARGET_LABEL[row.report_target] || row.report_target} · {row.period}</p>
                      <div className="flex items-center gap-1">
                        {badge && <span className={`rounded px-2 py-0.5 text-xs ${badge.className}`}>{badge.text}</span>}
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{labelStatus(row.status)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">조합: {row.fund_name || '미지정'} | 마감일: {formatDate(row.due_date)} | 제출일: {formatDate(row.submitted_date)}</p>
                    <textarea value={row.memo || ''} readOnly rows={3} className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700" />
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
                        className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200"
                      >
                        수정
                      </button>
                      <button onClick={() => { if (confirm('이 보고 기록을 삭제하시겠습니까?')) deleteMut.mutate(row.id) }} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">삭제</button>
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
