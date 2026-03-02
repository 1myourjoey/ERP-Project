import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createBizReport,
  createBizReportTemplate,
  deleteBizReport,
  detectBizReportAnomalies,
  fetchBizReportDocCollectionMatrix,
  fetchBizReportAnomalies,
  fetchBizReportCommentDiff,
  fetchBizReportMatrix,
  fetchBizReportRequests,
  fetchBizReportTemplates,
  fetchBizReports,
  fetchFunds,
  generateBizReportDocx,
  generateBizReportExcel,
  generateBizReportRequests,
  sendBizReportDocRequests,
  updateBizReport,
  updateBizReportRequest,
  updateBizReportRequestDocStatus,
  type BizReport,
  type BizReportAnomalyResponse,
  type BizReportCommentDiffResponse,
  type BizReportDocCollectionMatrix,
  type BizReportGenerationResponse,
  type BizReportInput,
  type BizReportMatrixResponse,
  type BizReportRequestDocStatusInput,
  type BizReportRequestResponse,
  type BizReportSendDocRequestsResponse,
  type BizReportTemplateInput,
  type BizReportTemplateResponse,
  type Fund,
} from '../lib/api'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import { formatKRW } from '../lib/labels'

type TabKey = 'matrix' | 'detail' | 'doc_collection' | 'generate'

const DOC_COLUMNS: Array<{
  key: BizReportRequestDocStatusInput['doc_type']
  label: string
}> = [
  { key: 'financial_statement', label: '재무' },
  { key: 'biz_registration', label: '사업자' },
  { key: 'shareholder_list', label: '주주' },
  { key: 'corp_registry', label: '등기' },
  { key: 'insurance_cert', label: '보험' },
  { key: 'credit_report', label: '신용' },
  { key: 'other_changes', label: '기타' },
]

function nextDocStatus(
  status: BizReportRequestDocStatusInput['status'],
): BizReportRequestDocStatusInput['status'] {
  if (status === 'not_requested') return 'requested'
  if (status === 'requested') return 'received'
  if (status === 'received') return 'verified'
  return 'not_requested'
}

function statusCellLabel(status: BizReportRequestDocStatusInput['status']): string {
  if (status === 'verified') return '✅'
  if (status === 'received') return '📥'
  if (status === 'requested') return '📨'
  return '⬜'
}

const DEFAULT_REPORT_INPUT: BizReportInput = {
  fund_id: 0,
  report_year: new Date().getFullYear(),
  status: '작성중',
  submission_date: null,
  total_commitment: null,
  total_paid_in: null,
  total_invested: null,
  total_distributed: null,
  fund_nav: null,
  irr: null,
  tvpi: null,
  dpi: null,
  market_overview: null,
  portfolio_summary: null,
  investment_activity: null,
  key_issues: null,
  outlook: null,
  memo: null,
}

function toDateLabel(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function statusBadgeClass(status: string | null | undefined) {
  if (!status) return 'bg-[#fff7d6] text-[#0f1f3d]'
  if (status.includes('완료') || status.includes('제출')) return 'bg-emerald-50 text-emerald-700'
  if (status.includes('검토')) return 'bg-amber-50 text-amber-700'
  if (status.includes('요청')) return 'bg-[#f5f9ff] text-[#1a3660]'
  return 'bg-[#fff7d6] text-[#0f1f3d]'
}

function downloadGeneratedFile(payload: BizReportGenerationResponse) {
  const binary = atob(payload.base64_data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: payload.content_type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = payload.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function BizReportsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<TabKey>('matrix')
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear())
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null)
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null)

  const [newReportForm, setNewReportForm] = useState<BizReportInput>(DEFAULT_REPORT_INPUT)
  const [newTemplateForm, setNewTemplateForm] = useState<BizReportTemplateInput>({
    name: '',
    report_type: 'quarterly',
    required_fields: null,
    template_file_id: null,
    instructions: null,
  })

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })

  const { data: reports = [], isLoading: reportsLoading } = useQuery<BizReport[]>({
    queryKey: ['bizReports', yearFilter],
    queryFn: () => fetchBizReports({ year: yearFilter }),
  })

  const { data: matrixData } = useQuery<BizReportMatrixResponse>({
    queryKey: ['bizReports', 'matrix', yearFilter],
    queryFn: () => fetchBizReportMatrix(yearFilter),
  })

  const { data: templates = [] } = useQuery<BizReportTemplateResponse[]>({
    queryKey: ['bizReportTemplates'],
    queryFn: fetchBizReportTemplates,
  })

  const { data: requestRows = [], isLoading: requestsLoading } = useQuery<BizReportRequestResponse[]>({
    queryKey: ['bizReportRequests', selectedReportId],
    queryFn: () => fetchBizReportRequests(selectedReportId as number),
    enabled: selectedReportId !== null,
  })

  const { data: anomalies = [] } = useQuery<BizReportAnomalyResponse[]>({
    queryKey: ['bizReportAnomalies', selectedRequestId],
    queryFn: () => fetchBizReportAnomalies(selectedRequestId as number),
    enabled: selectedRequestId !== null,
  })

  const { data: commentDiff } = useQuery<BizReportCommentDiffResponse>({
    queryKey: ['bizReportCommentDiff', selectedRequestId],
    queryFn: () => fetchBizReportCommentDiff(selectedRequestId as number),
    enabled: selectedRequestId !== null,
  })
  const { data: docCollection, isLoading: docCollectionLoading } = useQuery<BizReportDocCollectionMatrix>({
    queryKey: ['bizReports', 'docCollection', selectedReportId],
    queryFn: () => fetchBizReportDocCollectionMatrix({ report_id: selectedReportId as number }),
    enabled: selectedReportId !== null,
  })

  const reportMap = useMemo(() => new Map(reports.map((row) => [row.id, row])), [reports])

  const createReportMut = useMutation({
    mutationFn: (data: BizReportInput) => createBizReport(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      queryClient.invalidateQueries({ queryKey: ['bizReports', 'matrix'] })
      setSelectedReportId(created.id)
      setNewReportForm(DEFAULT_REPORT_INPUT)
      addToast('success', '영업보고를 생성했습니다.')
    },
  })

  const updateReportMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BizReportInput> }) => updateBizReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      queryClient.invalidateQueries({ queryKey: ['bizReports', 'matrix'] })
      addToast('success', '영업보고를 수정했습니다.')
    },
  })

  const deleteReportMut = useMutation({
    mutationFn: (id: number) => deleteBizReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      queryClient.invalidateQueries({ queryKey: ['bizReports', 'matrix'] })
      setSelectedReportId(null)
      addToast('success', '영업보고를 삭제했습니다.')
    },
  })

  const createTemplateMut = useMutation({
    mutationFn: (data: BizReportTemplateInput) => createBizReportTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReportTemplates'] })
      setNewTemplateForm({ name: '', report_type: 'quarterly', required_fields: null, template_file_id: null, instructions: null })
      addToast('success', '보고 템플릿을 생성했습니다.')
    },
  })

  const generateRequestsMut = useMutation({
    mutationFn: (reportId: number) => generateBizReportRequests(reportId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReportRequests', selectedReportId] })
      addToast('success', '투자사 데이터 요청을 생성했습니다.')
    },
  })

  const updateRequestMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateBizReportRequest>[1] }) => updateBizReportRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReportRequests', selectedReportId] })
      addToast('success', '요청 데이터를 저장했습니다.')
    },
  })
  const updateDocStatusMut = useMutation({
    mutationFn: ({ requestId, docType, status }: { requestId: number; docType: BizReportRequestDocStatusInput['doc_type']; status: BizReportRequestDocStatusInput['status'] }) =>
      updateBizReportRequestDocStatus(requestId, { doc_type: docType, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports', 'docCollection', selectedReportId] })
      queryClient.invalidateQueries({ queryKey: ['bizReportRequests', selectedReportId] })
    },
  })
  const sendDocRequestsMut = useMutation({
    mutationFn: (reportId: number) => sendBizReportDocRequests(reportId),
    onSuccess: (result: BizReportSendDocRequestsResponse) => {
      queryClient.invalidateQueries({ queryKey: ['bizReports', 'docCollection', selectedReportId] })
      queryClient.invalidateQueries({ queryKey: ['bizReportRequests', selectedReportId] })
      queryClient.invalidateQueries({ queryKey: ['generatedDocuments'] })
      addToast(
        'success',
        `서류요청 처리 ${result.updated_requests}건 완료 (공문 ${result.generated_documents.length}건 생성)`,
      )
    },
  })
  const completeAllDocsMut = useMutation({
    mutationFn: async () => {
      if (!docCollection) return { updated: 0 }
      let updated = 0
      for (const company of docCollection.companies) {
        for (const col of DOC_COLUMNS) {
          const current = company.docs[col.key]
          if (current === 'verified') continue
          await updateBizReportRequestDocStatus(company.request_id, {
            doc_type: col.key,
            status: 'verified',
          })
          updated += 1
        }
      }
      return { updated }
    },
    onSuccess: ({ updated }) => {
      queryClient.invalidateQueries({ queryKey: ['bizReports', 'docCollection', selectedReportId] })
      queryClient.invalidateQueries({ queryKey: ['bizReportRequests', selectedReportId] })
      addToast('success', `서류 상태 ${updated}건을 확인 완료로 반영했습니다.`)
    },
  })

  const detectAnomalyMut = useMutation({
    mutationFn: (requestId: number) => detectBizReportAnomalies(requestId),
    onSuccess: (_, requestId) => {
      setSelectedRequestId(requestId)
      queryClient.invalidateQueries({ queryKey: ['bizReportAnomalies', requestId] })
      queryClient.invalidateQueries({ queryKey: ['bizReportRequests', selectedReportId] })
      addToast('success', '특이점 감지를 완료했습니다.')
    },
  })

  const generateExcelMut = useMutation({
    mutationFn: (reportId: number) => generateBizReportExcel(reportId),
    onSuccess: (payload) => {
      downloadGeneratedFile(payload)
      addToast('success', '엑셀 보고서를 생성했습니다.')
    },
  })

  const generateDocxMut = useMutation({
    mutationFn: (reportId: number) => generateBizReportDocx(reportId),
    onSuccess: (payload) => {
      downloadGeneratedFile(payload)
      addToast('success', 'DOCX 보고서를 생성했습니다.')
    },
  })

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">영업보고</h2>
          <p className="page-subtitle">보고 매트릭스, 투자사 요청/검토, 문서 생성까지 한 화면에서 운영합니다.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('matrix')}
          className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'matrix' ? 'primary-btn' : 'secondary-btn text-[#0f1f3d]'}`}
        >
          보고 매트릭스
        </button>
        <button
          onClick={() => setActiveTab('detail')}
          className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'detail' ? 'primary-btn' : 'secondary-btn text-[#0f1f3d]'}`}
        >
          보고 상세/검토
        </button>
        <button
          onClick={() => setActiveTab('doc_collection')}
          className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'doc_collection' ? 'primary-btn' : 'secondary-btn text-[#0f1f3d]'}`}
        >
          서류 수집
        </button>
        <button
          onClick={() => setActiveTab('generate')}
          className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'generate' ? 'primary-btn' : 'secondary-btn text-[#0f1f3d]'}`}
        >
          보고서 생성
        </button>
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">연도</label>
            <input
              type="number"
              value={yearFilter}
              onChange={(e) => setYearFilter(Number(e.target.value || new Date().getFullYear()))}
              className="form-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">보고 선택</label>
            <select
              value={selectedReportId || ''}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null
                setSelectedReportId(next)
                setSelectedRequestId(null)
              }}
              className="form-input"
            >
              <option value="">보고 선택</option>
              {reports.map((row) => (
                <option key={row.id} value={row.id}>
                  #{row.id} · {(funds.find((f) => f.id === row.fund_id)?.name || row.fund_name || `조합 ${row.fund_id}`)} · {row.report_year}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 rounded bg-[#f5f9ff] p-2 text-xs text-[#64748b]">
            선택 보고 상태: {selectedReportId ? (reportMap.get(selectedReportId)?.status || '-') : '미선택'} ·
            제출일: {selectedReportId ? toDateLabel(reportMap.get(selectedReportId)?.submission_date) : '-'}
          </div>
        </div>
      </div>

      {activeTab === 'matrix' && (
        <>
          <div className="card-base overflow-hidden">
            <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">조합 × 분기 보고 매트릭스</h3>
            {!matrixData?.rows?.length ? (
              <EmptyState emoji="📊" message="매트릭스 데이터가 없습니다." className="py-8" />
            ) : (
              <div className="overflow-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                    <tr>
                      <th className="px-3 py-2 text-left">조합</th>
                      <th className="px-3 py-2 text-center">1Q</th>
                      <th className="px-3 py-2 text-center">2Q</th>
                      <th className="px-3 py-2 text-center">3Q</th>
                      <th className="px-3 py-2 text-center">4Q</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {matrixData.rows.map((row) => (
                      <tr key={row.fund_id}>
                        <td className="px-3 py-2 font-medium text-[#0f1f3d]">{row.fund_name}</td>
                        {row.cells.map((cell) => (
                          <td key={`${row.fund_id}-${cell.quarter}`} className="px-3 py-2 text-center">
                            <span className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(cell.status)}`}>{cell.status}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card-base">
              <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">영업보고 생성</h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
                  <select
                    value={newReportForm.fund_id || ''}
                    onChange={(e) => setNewReportForm((prev) => ({ ...prev, fund_id: Number(e.target.value) || 0 }))}
                    className="form-input"
                  >
                    <option value="">조합 선택</option>
                    {funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>{fund.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">연도</label>
                  <input
                    type="number"
                    value={newReportForm.report_year}
                    onChange={(e) => setNewReportForm((prev) => ({ ...prev, report_year: Number(e.target.value || new Date().getFullYear()) }))}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
                  <select
                    value={newReportForm.status || '작성중'}
                    onChange={(e) => setNewReportForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="form-input"
                  >
                    <option value="작성중">작성중</option>
                    <option value="검토중">검토중</option>
                    <option value="완료">완료</option>
                  </select>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!newReportForm.fund_id) {
                    addToast('warning', '조합을 선택해 주세요.')
                    return
                  }
                  createReportMut.mutate(newReportForm)
                }}
                className="primary-btn mt-3"
                disabled={createReportMut.isPending}
              >
                보고 생성
              </button>
            </div>

            <div className="card-base">
              <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">템플릿 관리</h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  value={newTemplateForm.name}
                  onChange={(e) => setNewTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="템플릿 이름"
                  className="rounded border px-2 py-1 text-sm"
                />
                <select
                  value={newTemplateForm.report_type}
                  onChange={(e) => setNewTemplateForm((prev) => ({ ...prev, report_type: e.target.value }))}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="quarterly">quarterly</option>
                  <option value="semi-annual">semi-annual</option>
                  <option value="annual">annual</option>
                </select>
              </div>
              <button
                onClick={() => {
                  if (!newTemplateForm.name.trim()) {
                    addToast('warning', '템플릿 이름을 입력해 주세요.')
                    return
                  }
                  createTemplateMut.mutate({ ...newTemplateForm, name: newTemplateForm.name.trim() })
                }}
                className="secondary-btn mt-2"
              >
                템플릿 생성
              </button>
              <div className="mt-2 space-y-1">
                {templates.slice(0, 5).map((tpl) => (
                  <div key={tpl.id} className="rounded bg-[#f5f9ff] px-2 py-1 text-xs text-[#64748b]">
                    {tpl.name} · {tpl.report_type}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">영업보고 목록</h3>
            {reportsLoading ? (
              <PageLoading />
            ) : !reports.length ? (
              <EmptyState emoji="🧾" message="보고가 없습니다." className="py-8" />
            ) : (
              <div className="space-y-2">
                {reports.map((report) => (
                  <div key={report.id} className="rounded border border-[#d8e5fb] p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[#0f1f3d]">
                          #{report.id} · {report.fund_name || `조합 ${report.fund_id}`} · {report.report_year}
                        </p>
                        <p className="text-xs text-[#64748b]">
                          NAV {formatKRW(Number(report.fund_nav || 0))} · IRR {report.irr != null ? `${report.irr}%` : '-'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(report.status)}`}>{report.status}</span>
                        <button
                          onClick={() => updateReportMut.mutate({ id: report.id, data: { status: report.status === '완료' ? '작성중' : '완료' } })}
                          className="secondary-btn"
                        >
                          상태변경
                        </button>
                        <button onClick={() => setSelectedReportId(report.id)} className="secondary-btn">선택</button>
                        <button onClick={() => deleteReportMut.mutate(report.id)} className="danger-btn">삭제</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'detail' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="card-base">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#0f1f3d]">투자사 데이터 요청</h3>
              <button
                onClick={() => selectedReportId && generateRequestsMut.mutate(selectedReportId)}
                disabled={!selectedReportId || generateRequestsMut.isPending}
                className="secondary-btn"
              >
                요청 일괄생성
              </button>
            </div>

            {requestsLoading ? (
              <PageLoading />
            ) : !selectedReportId ? (
              <EmptyState emoji="📌" message="상단에서 보고를 선택해 주세요." className="py-8" />
            ) : !requestRows.length ? (
              <EmptyState emoji="📨" message="요청 데이터가 없습니다. 일괄생성 버튼을 눌러주세요." className="py-8" />
            ) : (
              <div className="space-y-2">
                {requestRows.map((row) => (
                  <div key={row.id} className="rounded border border-[#d8e5fb] p-2">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[#0f1f3d]">{row.investment_name || `투자건 ${row.investment_id}`}</p>
                        <p className="text-xs text-[#64748b]">요청일 {toDateLabel(row.request_date)} · 마감일 {toDateLabel(row.deadline)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => detectAnomalyMut.mutate(row.id)}
                          className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"
                        >
                          특이점 감지
                        </button>
                        <button
                          onClick={() => setSelectedRequestId(row.id)}
                          className="secondary-btn"
                        >
                          상세
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                      <input
                        type="number"
                        defaultValue={row.revenue || ''}
                        placeholder="매출"
                        className="rounded border px-2 py-1 text-sm"
                        onBlur={(e) => updateRequestMut.mutate({ id: row.id, data: { revenue: e.target.value ? Number(e.target.value) : null } })}
                      />
                      <input
                        type="number"
                        defaultValue={row.operating_income || ''}
                        placeholder="영업이익"
                        className="rounded border px-2 py-1 text-sm"
                        onBlur={(e) => updateRequestMut.mutate({ id: row.id, data: { operating_income: e.target.value ? Number(e.target.value) : null } })}
                      />
                      <input
                        type="number"
                        defaultValue={row.net_income || ''}
                        placeholder="순이익"
                        className="rounded border px-2 py-1 text-sm"
                        onBlur={(e) => updateRequestMut.mutate({ id: row.id, data: { net_income: e.target.value ? Number(e.target.value) : null } })}
                      />
                      <select
                        defaultValue={row.status}
                        className="rounded border px-2 py-1 text-sm"
                        onChange={(e) => updateRequestMut.mutate({ id: row.id, data: { status: e.target.value } })}
                      >
                        <option value="미요청">미요청</option>
                        <option value="요청">요청</option>
                        <option value="제출">제출</option>
                        <option value="검토중">검토중</option>
                        <option value="완료">완료</option>
                        <option value="반려">반려</option>
                      </select>
                    </div>
                    <textarea
                      defaultValue={row.comment || ''}
                      placeholder="분기 코멘트"
                      className="form-input mt-2"
                      rows={2}
                      onBlur={(e) => updateRequestMut.mutate({ id: row.id, data: { comment: e.target.value || null } })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">특이점/코멘트 Diff</h3>
            {!selectedRequestId ? (
              <EmptyState emoji="🔎" message="요청 건 상세를 선택해 주세요." className="py-8" />
            ) : (
              <>
                <div className="mb-2 rounded border border-[#d8e5fb] p-2">
                  <p className="mb-1 text-xs font-medium text-[#64748b]">코멘트 변경 비교</p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded bg-[#f5f9ff] p-2">
                      <p className="mb-1 text-[11px] text-[#64748b]">이전 분기</p>
                      <p className="text-sm text-[#0f1f3d]">{commentDiff?.previous_comment || '-'}</p>
                    </div>
                    <div className="rounded bg-[#f5f9ff] p-2">
                      <p className="mb-1 text-[11px] text-[#64748b]">현재 분기</p>
                      <p className="text-sm text-[#0f1f3d]">{commentDiff?.current_comment || '-'}</p>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[#64748b]">변경 여부: {commentDiff?.changed ? '변경됨' : '동일'}</p>
                </div>

                <div className="space-y-1">
                  {anomalies.length === 0 ? (
                    <EmptyState emoji="✅" message="감지된 특이점이 없습니다." className="py-6" />
                  ) : (
                    anomalies.map((row) => (
                      <div key={row.id} className="rounded border border-[#d8e5fb] p-2">
                        <p className="text-sm font-medium text-[#0f1f3d]">{row.anomaly_type}</p>
                        <p className="text-xs text-[#64748b]">심각도: {row.severity}</p>
                        <p className="mt-1 text-sm text-[#0f1f3d]">{row.detail || '-'}</p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'doc_collection' && (
        <div className="card-base">
          {!selectedReportId ? (
            <EmptyState emoji="📌" message="상단에서 보고를 선택해 주세요." className="py-8" />
          ) : docCollectionLoading ? (
            <PageLoading />
          ) : !docCollection ? (
            <EmptyState emoji="📄" message="서류 수집 데이터가 없습니다." className="py-8" />
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] p-3">
                <p className="text-sm font-semibold text-[#0f1f3d]">
                  {docCollection.fund_name} · {docCollection.quarter} 서류 수집 현황
                </p>
                <p className="mt-1 text-xs text-[#64748b]">
                  진행률 {docCollection.completed_companies}/{docCollection.total_companies} 기업 완료 ({docCollection.completion_pct}%)
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded bg-[#d8e5fb]">
                  <div
                    className="h-2 rounded bg-[#558ef8]"
                    style={{ width: `${Math.max(0, Math.min(100, docCollection.completion_pct || 0))}%` }}
                  />
                </div>
              </div>

              <div className="overflow-auto rounded border border-[#d8e5fb]">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                    <tr>
                      <th className="px-3 py-2 text-left">기업명</th>
                      {DOC_COLUMNS.map((col) => (
                        <th key={col.key} className="px-3 py-2 text-center">{col.label}</th>
                      ))}
                      <th className="px-3 py-2 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {docCollection.companies.map((row) => (
                      <tr key={row.request_id} className="hover:bg-[#f5f9ff]">
                        <td className="px-3 py-2 font-medium text-[#0f1f3d]">{row.company_name}</td>
                        {DOC_COLUMNS.map((col) => {
                          const value = row.docs[col.key]
                          const isUpdating =
                            updateDocStatusMut.isPending
                            && updateDocStatusMut.variables?.requestId === row.request_id
                            && updateDocStatusMut.variables?.docType === col.key
                          return (
                            <td key={`${row.request_id}-${col.key}`} className="px-3 py-2 text-center">
                              <button
                                type="button"
                                className="rounded px-2 py-1 text-base hover:bg-[#fff7d6] disabled:opacity-50"
                                disabled={isUpdating}
                                title={`${col.label}: ${value}`}
                                onClick={() =>
                                  updateDocStatusMut.mutate({
                                    requestId: row.request_id,
                                    docType: col.key,
                                    status: nextDocStatus(value),
                                  })
                                }
                              >
                                {statusCellLabel(value)}
                              </button>
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-sm text-[#0f1f3d]">{row.status}</td>
                      </tr>
                    ))}
                    {docCollection.companies.length === 0 && (
                      <tr>
                        <td className="px-3 py-8 text-center text-sm text-[#64748b]" colSpan={DOC_COLUMNS.length + 2}>
                          투자사 요청 데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="primary-btn"
                  disabled={sendDocRequestsMut.isPending}
                  onClick={() => sendDocRequestsMut.mutate(selectedReportId)}
                >
                  미수집 기업 일괄 서류요청 공문 생성
                </button>
                <button
                  className="secondary-btn"
                  disabled={completeAllDocsMut.isPending}
                  onClick={() => completeAllDocsMut.mutate()}
                >
                  전체 확인 완료
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'generate' && (
        <div className="card-base">
          <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">보고서 생성</h3>
          {!selectedReportId ? (
            <EmptyState emoji="📁" message="상단에서 보고를 선택해 주세요." className="py-8" />
          ) : (
            <>
              <div className="mb-3 rounded border border-[#d8e5fb] p-3">
                <p className="text-sm font-medium text-[#0f1f3d]">
                  #{selectedReportId} · {reportMap.get(selectedReportId)?.fund_name || `조합 ${reportMap.get(selectedReportId)?.fund_id}`}
                </p>
                <p className="mt-1 text-xs text-[#64748b]">
                  보고연도 {reportMap.get(selectedReportId)?.report_year} · 상태 {reportMap.get(selectedReportId)?.status}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => generateExcelMut.mutate(selectedReportId)}
                  disabled={generateExcelMut.isPending}
                  className="primary-btn"
                >
                  엑셀 생성/다운로드
                </button>
                <button
                  onClick={() => generateDocxMut.mutate(selectedReportId)}
                  disabled={generateDocxMut.isPending}
                  className="secondary-btn"
                >
                  DOCX 생성/다운로드
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}




