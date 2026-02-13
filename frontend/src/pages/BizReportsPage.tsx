import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBizReport,
  deleteBizReport,
  fetchBizReports,
  fetchCompanies,
  updateBizReport,
  type BizReport,
  type BizReportInput,
  type Company,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'

interface FilterState {
  company_id: number | null
  report_type: string
  status: string
}

const REPORT_TYPE_OPTIONS = ['분기보고', '월보고', '일반보고']
const STATUS_OPTIONS = ['요청전', '요청중', '수신', '검수완료']
const STATUS_CLASS: Record<string, string> = {
  요청전: 'bg-slate-100 text-slate-700',
  요청중: 'bg-blue-100 text-blue-700',
  수신: 'bg-amber-100 text-amber-700',
  검수완료: 'bg-green-100 text-green-700',
}

const EMPTY_FILTERS: FilterState = {
  company_id: null,
  report_type: '',
  status: '',
}

const EMPTY_INPUT: BizReportInput = {
  company_id: 0,
  report_type: '분기보고',
  period: '',
  status: '요청전',
  requested_date: '',
  received_date: null,
  reviewed_date: null,
  analyst_comment: '',
  revenue: null,
  operating_income: null,
  net_income: null,
  total_assets: null,
  total_liabilities: null,
  employees: null,
  memo: '',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString()
}

export default function BizReportsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [showCreate, setShowCreate] = useState(false)
  const [newReport, setNewReport] = useState<BizReportInput>(EMPTY_INPUT)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<BizReportInput | null>(null)

  const params = useMemo(
    () => ({
      company_id: filters.company_id || undefined,
      report_type: filters.report_type || undefined,
      status: filters.status || undefined,
    }),
    [filters],
  )

  const { data: companies } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  })

  const { data: rows, isLoading } = useQuery<BizReport[]>({
    queryKey: ['bizReports', params],
    queryFn: () => fetchBizReports(params),
  })

  const createMut = useMutation({
    mutationFn: (data: BizReportInput) => createBizReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      setShowCreate(false)
      setNewReport(EMPTY_INPUT)
      addToast('success', '영업보고를 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BizReportInput> }) => updateBizReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      setEditingId(null)
      setEditForm(null)
      addToast('success', '영업보고를 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteBizReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      addToast('success', '영업보고를 삭제했습니다.')
    },
  })

  const companyMap = useMemo(() => new Map((companies || []).map((company) => [company.id, company.name])), [companies])

  return (
    <div className="max-w-7xl p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">영업보고 관리</h2>
          <p className="mt-1 text-sm text-slate-500">피투자사 정기/수시 경영현황 수집</p>
        </div>
        <button onClick={() => setShowCreate((prev) => !prev)} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">
          + 신규 등록
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">필터</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <select value={filters.company_id || ''} onChange={(e) => setFilters((prev) => ({ ...prev, company_id: Number(e.target.value) || null }))} className="rounded border px-2 py-1 text-sm">
            <option value="">전체 피투자사</option>
            {companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
          <select value={filters.report_type} onChange={(e) => setFilters((prev) => ({ ...prev, report_type: e.target.value }))} className="rounded border px-2 py-1 text-sm">
            <option value="">전체 유형</option>
            {REPORT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
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
          <h3 className="mb-2 text-sm font-semibold text-slate-700">신규 영업보고 등록</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select value={newReport.company_id || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, company_id: Number(e.target.value) || 0 }))} className="rounded border px-2 py-1 text-sm">
              <option value="">피투자사 선택</option>
              {companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <select value={newReport.report_type} onChange={(e) => setNewReport((prev) => ({ ...prev, report_type: e.target.value }))} className="rounded border px-2 py-1 text-sm">
              {REPORT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input value={newReport.period} onChange={(e) => setNewReport((prev) => ({ ...prev, period: e.target.value }))} className="rounded border px-2 py-1 text-sm" placeholder="기간 (예: 2026-Q1)" />
            <input type="date" value={newReport.requested_date || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, requested_date: e.target.value || null }))} className="rounded border px-2 py-1 text-sm" />
            <input value={newReport.memo || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, memo: e.target.value }))} className="rounded border px-2 py-1 text-sm" placeholder="비고" />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                if (!newReport.company_id || !newReport.report_type || !newReport.period.trim()) return
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
          <p className="p-2 text-sm text-slate-400">영업보고가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="px-2 py-2">피투자사</th>
                  <th className="px-2 py-2">유형</th>
                  <th className="px-2 py-2">기간</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">요청일</th>
                  <th className="px-2 py-2">수신일</th>
                  <th className="px-2 py-2">검수일</th>
                  <th className="px-2 py-2">재무요약</th>
                  <th className="px-2 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="cursor-pointer border-b hover:bg-slate-50" onClick={() => {
                      setEditingId(row.id)
                      setEditForm({
                        company_id: row.company_id,
                        report_type: row.report_type,
                        period: row.period,
                        status: row.status,
                        requested_date: row.requested_date,
                        received_date: row.received_date,
                        reviewed_date: row.reviewed_date,
                        analyst_comment: row.analyst_comment,
                        revenue: row.revenue,
                        operating_income: row.operating_income,
                        net_income: row.net_income,
                        total_assets: row.total_assets,
                        total_liabilities: row.total_liabilities,
                        employees: row.employees,
                        memo: row.memo,
                      })
                    }}>
                      <td className="px-2 py-2">{row.company_name || companyMap.get(row.company_id) || row.company_id}</td>
                      <td className="px-2 py-2">{row.report_type}</td>
                      <td className="px-2 py-2">{row.period}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[row.status] || 'bg-slate-100 text-slate-700'}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-2 py-2">{formatDate(row.requested_date)}</td>
                      <td className="px-2 py-2">{formatDate(row.received_date)}</td>
                      <td className="px-2 py-2">{formatDate(row.reviewed_date)}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">
                        매출 {formatNumber(row.revenue)} / 영업이익 {formatNumber(row.operating_income)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingId(row.id)
                            }}
                            className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                          >
                            수정
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm('이 영업보고를 삭제하시겠습니까?')) deleteMut.mutate(row.id)
                            }}
                            className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === row.id && editForm && (
                      <tr className="border-b bg-slate-50">
                        <td className="px-2 py-2" colSpan={9}>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                            <select value={editForm.status || '요청전'} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, status: e.target.value } : prev))} className="rounded border px-2 py-1 text-sm">
                              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                            <input type="date" value={editForm.received_date || ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, received_date: e.target.value || null } : prev))} className="rounded border px-2 py-1 text-sm" />
                            <input type="date" value={editForm.reviewed_date || ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, reviewed_date: e.target.value || null } : prev))} className="rounded border px-2 py-1 text-sm" />
                            <input type="number" value={editForm.revenue ?? ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, revenue: e.target.value ? Number(e.target.value) : null } : prev))} className="rounded border px-2 py-1 text-sm" placeholder="매출" />
                            <input type="number" value={editForm.operating_income ?? ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, operating_income: e.target.value ? Number(e.target.value) : null } : prev))} className="rounded border px-2 py-1 text-sm" placeholder="영업이익" />
                            <input type="number" value={editForm.net_income ?? ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, net_income: e.target.value ? Number(e.target.value) : null } : prev))} className="rounded border px-2 py-1 text-sm" placeholder="당기순이익" />
                            <input type="number" value={editForm.total_assets ?? ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, total_assets: e.target.value ? Number(e.target.value) : null } : prev))} className="rounded border px-2 py-1 text-sm" placeholder="총자산" />
                            <input type="number" value={editForm.total_liabilities ?? ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, total_liabilities: e.target.value ? Number(e.target.value) : null } : prev))} className="rounded border px-2 py-1 text-sm" placeholder="총부채" />
                            <input type="number" value={editForm.employees ?? ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, employees: e.target.value ? Number(e.target.value) : null } : prev))} className="rounded border px-2 py-1 text-sm" placeholder="종업원 수" />
                            <input value={editForm.analyst_comment || ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, analyst_comment: e.target.value } : prev))} className="rounded border px-2 py-1 text-sm md:col-span-2" placeholder="심사역 의견" />
                            <input value={editForm.memo || ''} onChange={(e) => setEditForm((prev) => (prev ? { ...prev, memo: e.target.value } : prev))} className="rounded border px-2 py-1 text-sm md:col-span-2" placeholder="비고" />
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => {
                                updateMut.mutate({
                                  id: row.id,
                                  data: {
                                    ...editForm,
                                    memo: editForm.memo?.trim() || null,
                                    analyst_comment: editForm.analyst_comment?.trim() || null,
                                  },
                                })
                              }}
                              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                              disabled={updateMut.isPending}
                            >
                              저장
                            </button>
                            <button onClick={() => { setEditingId(null); setEditForm(null) }} className="rounded border bg-white px-3 py-1 text-xs hover:bg-slate-100">
                              취소
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
