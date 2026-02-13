import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBizReport,
  deleteBizReport,
  fetchBizReports,
  fetchFund,
  fetchFunds,
  fetchInvestments,
  updateBizReport,
  type BizReport,
  type BizReportInput,
  type Fund,
} from '../lib/api'
import { formatKRW } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'

interface InvestmentListItem {
  id: number
  fund_id: number
  company_id: number
  company_name: string
}

interface FilterState {
  fund_id: number | null
  report_type: string
  status: string
}

const REPORT_TYPE_OPTIONS = ['분기보고', '월보고', '일반보고']
const STATUS_OPTIONS = ['요청전', '요청중', '수신', '검수완료']
const STATUS_CLASS: Record<string, string> = {
  요청전: 'bg-gray-100 text-gray-700',
  요청중: 'bg-blue-100 text-blue-700',
  수신: 'bg-amber-100 text-amber-700',
  검수완료: 'bg-green-100 text-green-700',
}

const EMPTY_FILTERS: FilterState = {
  fund_id: null,
  report_type: '',
  status: '',
}

const EMPTY_INPUT: BizReportInput = {
  company_id: 0,
  fund_id: null,
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

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })

  const { data: selectedFund } = useQuery({
    queryKey: ['fund', filters.fund_id],
    queryFn: () => fetchFund(filters.fund_id as number),
    enabled: !!filters.fund_id,
  })

  const { data: fundInvestments } = useQuery<InvestmentListItem[]>({
    queryKey: ['investments', { fund_id: filters.fund_id }],
    queryFn: () => fetchInvestments({ fund_id: filters.fund_id as number }),
    enabled: !!filters.fund_id,
  })

  const params = useMemo(
    () => ({
      fund_id: filters.fund_id || undefined,
      report_type: filters.report_type || undefined,
      status: filters.status || undefined,
    }),
    [filters],
  )

  const { data: reports, isLoading } = useQuery<BizReport[]>({
    queryKey: ['bizReports', params],
    queryFn: () => fetchBizReports(params),
  })

  useEffect(() => {
    setNewReport((prev) => ({ ...prev, fund_id: filters.fund_id }))
  }, [filters.fund_id])

  const latestReportByCompany = useMemo(() => {
    const map = new Map<number, BizReport>()
    for (const report of reports ?? []) {
      if (!map.has(report.company_id)) {
        map.set(report.company_id, report)
      }
    }
    return map
  }, [reports])

  const createMut = useMutation({
    mutationFn: (data: BizReportInput) => createBizReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      setShowCreate(false)
      setNewReport({ ...EMPTY_INPUT, fund_id: filters.fund_id })
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

  return (
    <div className="max-w-7xl p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">영업보고</h2>
          <p className="mt-1 text-sm text-gray-500">조합 단위로 피투자사 영업보고를 관리합니다.</p>
        </div>
        <button onClick={() => setShowCreate((prev) => !prev)} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">
          + 보고서 작성
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <select value={filters.fund_id || ''} onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="rounded-xl border border-gray-200 px-2 py-1 text-sm">
            <option value="">대상 조합 선택</option>
            {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>
          <select value={filters.report_type} onChange={(e) => setFilters((prev) => ({ ...prev, report_type: e.target.value }))} className="rounded-xl border border-gray-200 px-2 py-1 text-sm">
            <option value="">전체 보고유형</option>
            {REPORT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="rounded-xl border border-gray-200 px-2 py-1 text-sm">
            <option value="">전체 상태</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <button onClick={() => setFilters(EMPTY_FILTERS)} className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-100">
          필터 초기화
        </button>
      </div>

      {filters.fund_id && selectedFund && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">선택 조합 재무 요약</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4 text-sm">
            <div className="rounded bg-gray-50 p-2">조합명: {selectedFund.name}</div>
            <div className="rounded bg-gray-50 p-2">약정총액: {formatKRW(selectedFund.commitment_total ?? null)}</div>
            <div className="rounded bg-gray-50 p-2">AUM: {formatKRW(selectedFund.aum ?? null)}</div>
            <div className="rounded bg-gray-50 p-2">투자건수: {fundInvestments?.length ?? 0}건</div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">영업보고 작성</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select value={newReport.company_id || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, company_id: Number(e.target.value) || 0 }))} className="rounded border px-2 py-1 text-sm">
              <option value="">피투자사 선택</option>
              {(fundInvestments ?? []).map((item) => <option key={item.id} value={item.company_id}>{item.company_name}</option>)}
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
                if (!newReport.company_id || !newReport.period.trim()) return
                createMut.mutate({
                  ...newReport,
                  fund_id: filters.fund_id || null,
                  period: newReport.period.trim(),
                  memo: newReport.memo?.trim() || null,
                })
              }}
              disabled={createMut.isPending}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              저장
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded border bg-white px-3 py-1 text-xs hover:bg-gray-100">
              취소
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">피투자사 현황</h3>
        {!filters.fund_id ? (
          <p className="text-sm text-gray-400">조합을 먼저 선택하세요.</p>
        ) : isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : !(fundInvestments?.length) ? (
          <p className="text-sm text-gray-400">선택한 조합의 투자건이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="px-2 py-2">회사명</th>
                  <th className="px-2 py-2">보고유형</th>
                  <th className="px-2 py-2">기간</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">재무</th>
                  <th className="px-2 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {fundInvestments.map((item) => {
                  const report = latestReportByCompany.get(item.company_id)
                  const isEditing = !!report && editingId === report.id && !!editForm
                  return (
                    <tr key={item.id} className="border-b">
                      <td className="px-2 py-2 font-medium text-gray-800">{item.company_name}</td>
                      <td className="px-2 py-2">
                        {isEditing && editForm ? (
                          <select value={editForm.report_type} onChange={(e) => setEditForm((prev) => prev ? { ...prev, report_type: e.target.value } : prev)} className="rounded border px-2 py-1 text-xs">
                            {REPORT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                        ) : (
                          report?.report_type || '-'
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isEditing && editForm ? (
                          <input value={editForm.period} onChange={(e) => setEditForm((prev) => prev ? { ...prev, period: e.target.value } : prev)} className="rounded border px-2 py-1 text-xs" />
                        ) : (
                          report?.period || '-'
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isEditing && editForm ? (
                          <select value={editForm.status || '요청전'} onChange={(e) => setEditForm((prev) => prev ? { ...prev, status: e.target.value } : prev)} className="rounded border px-2 py-1 text-xs">
                            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        ) : report ? (
                          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[report.status] || 'bg-gray-100 text-gray-700'}`}>{report.status}</span>
                        ) : '-'}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-600">
                        {isEditing && editForm ? (
                          <div className="flex gap-1">
                            <input type="number" value={editForm.revenue ?? ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, revenue: e.target.value ? Number(e.target.value) : null } : prev)} placeholder="매출" className="w-20 rounded border px-1 py-1 text-[11px]" />
                            <input type="number" value={editForm.operating_income ?? ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, operating_income: e.target.value ? Number(e.target.value) : null } : prev)} placeholder="영업이익" className="w-20 rounded border px-1 py-1 text-[11px]" />
                          </div>
                        ) : report ? `매출 ${formatNumber(report.revenue)} / 영업이익 ${formatNumber(report.operating_income)}` : '-'}
                      </td>
                      <td className="px-2 py-2">
                        {!report ? (
                          <span className="text-xs text-gray-400">보고서 없음</span>
                        ) : isEditing && editForm ? (
                          <div className="flex gap-1">
                            <button onClick={() => updateMut.mutate({ id: report.id, data: editForm })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">저장</button>
                            <button onClick={() => { setEditingId(null); setEditForm(null) }} className="rounded border px-2 py-1 text-xs hover:bg-gray-100">취소</button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingId(report.id)
                                setEditForm({
                                  company_id: report.company_id,
                                  fund_id: report.fund_id,
                                  report_type: report.report_type,
                                  period: report.period,
                                  status: report.status,
                                  requested_date: report.requested_date,
                                  received_date: report.received_date,
                                  reviewed_date: report.reviewed_date,
                                  analyst_comment: report.analyst_comment,
                                  revenue: report.revenue,
                                  operating_income: report.operating_income,
                                  net_income: report.net_income,
                                  total_assets: report.total_assets,
                                  total_liabilities: report.total_liabilities,
                                  employees: report.employees,
                                  memo: report.memo,
                                })
                              }}
                              className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200"
                            >
                              수정
                            </button>
                            <button onClick={() => { if (confirm('이 영업보고를 삭제하시겠습니까?')) deleteMut.mutate(report.id) }} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">삭제</button>
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
