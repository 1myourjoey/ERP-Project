import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import {
  autoEvaluateInternalReview,
  completeInternalReview,
  createInternalReview,
  downloadGeneratedDocument,
  fetchFunds,
  fetchInternalReview,
  fetchInternalReviews,
  generateInternalReviewCompanyReportDocument,
  generateInternalReviewReportDocument,
  updateInternalReviewCompanyReview,
  type CompanyReview,
  type Fund,
  type InternalReview,
} from '../lib/api'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import { formatKRW } from '../lib/labels'

function statusLabel(value: string | null | undefined): string {
  if (!value) return '-'
  if (value === 'completed') return '완료'
  if (value === 'reviewing') return '검토중'
  if (value === 'data_collecting') return '데이터 수집중'
  if (value === 'preparing') return '준비중'
  return value
}

function badgeClass(value: string | null | undefined): string {
  if (value === 'completed') return 'tag tag-green'
  if (value === 'reviewing') return 'tag tag-blue'
  if (value === 'data_collecting') return 'tag tag-amber'
  return 'tag tag-gray'
}

function quarterOptions() {
  return [1, 2, 3, 4]
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function CompanyReviewCard({
  row,
  loading,
  reportLoading,
  onSave,
  onGenerateReport,
}: {
  row: CompanyReview
  loading: boolean
  reportLoading: boolean
  onSave: (payload: Partial<CompanyReview>) => void
  onGenerateReport: () => void
}) {
  const [draft, setDraft] = useState({
    quarterly_revenue: row.quarterly_revenue,
    quarterly_net_income: row.quarterly_net_income,
    total_equity: row.total_equity,
    asset_rating: row.asset_rating || 'AA',
    impairment_type: row.impairment_type || 'none',
    impairment_amount: row.impairment_amount,
    key_issues: row.key_issues || '',
    follow_up_actions: row.follow_up_actions || '',
    investment_opinion: row.investment_opinion || '유지',
  })

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">{row.company_name}</p>
        <div className="flex items-center gap-1 text-xs">
          <span className="tag tag-gray">등급 {row.asset_rating || '-'}</span>
          <span className="tag tag-gray">손상 {row.impairment_type || '-'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">분기 매출</label>
          <input
            type="number"
            className="form-input"
            value={draft.quarterly_revenue ?? ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, quarterly_revenue: event.target.value ? Number(event.target.value) : null }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">분기 순이익</label>
          <input
            type="number"
            className="form-input"
            value={draft.quarterly_net_income ?? ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, quarterly_net_income: event.target.value ? Number(event.target.value) : null }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">자본총계</label>
          <input
            type="number"
            className="form-input"
            value={draft.total_equity ?? ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, total_equity: event.target.value ? Number(event.target.value) : null }))}
          />
        </div>
        <div className="rounded bg-gray-50 px-2 py-2 text-xs text-gray-600">
          추정 투자원금
          <p className="mt-1 font-semibold text-gray-800">{formatKRW(row.paid_in_capital)}</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">건전성 등급</label>
          <select
            className="form-input"
            value={draft.asset_rating}
            onChange={(event) => setDraft((prev) => ({ ...prev, asset_rating: event.target.value }))}
          >
            <option value="AA">AA</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">손상 유형</label>
          <select
            className="form-input"
            value={draft.impairment_type}
            onChange={(event) => setDraft((prev) => ({ ...prev, impairment_type: event.target.value }))}
          >
            <option value="none">없음</option>
            <option value="partial">부분손상</option>
            <option value="full">전액손상</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">손상금액</label>
          <input
            type="number"
            className="form-input"
            value={draft.impairment_amount ?? ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, impairment_amount: event.target.value ? Number(event.target.value) : null }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">투자 의견</label>
          <select
            className="form-input"
            value={draft.investment_opinion}
            onChange={(event) => setDraft((prev) => ({ ...prev, investment_opinion: event.target.value }))}
          >
            <option value="유지">유지</option>
            <option value="회수검토">회수검토</option>
            <option value="추가투자검토">추가투자검토</option>
            <option value="손상처리">손상처리</option>
          </select>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">주요 이슈</label>
          <textarea
            rows={2}
            className="form-input"
            value={draft.key_issues}
            onChange={(event) => setDraft((prev) => ({ ...prev, key_issues: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">후속 조치</label>
          <textarea
            rows={2}
            className="form-input"
            value={draft.follow_up_actions}
            onChange={(event) => setDraft((prev) => ({ ...prev, follow_up_actions: event.target.value }))}
          />
        </div>
      </div>

      {!!row.impairment_flags.length && (
        <div className="mt-2 rounded bg-amber-50 px-2 py-2 text-xs text-amber-900">
          {row.impairment_flags.join(' / ')}
        </div>
      )}

      <div className="mt-2 flex justify-end gap-1">
        <button
          className="secondary-btn btn-sm"
          disabled={reportLoading}
          onClick={onGenerateReport}
        >
          후속관리보고서 생성
        </button>
        <button
          className="secondary-btn btn-sm"
          disabled={loading}
          onClick={() =>
            onSave({
              quarterly_revenue: draft.quarterly_revenue,
              quarterly_net_income: draft.quarterly_net_income,
              total_equity: draft.total_equity,
              asset_rating: draft.asset_rating,
              impairment_type: draft.impairment_type,
              impairment_amount: draft.impairment_amount,
              key_issues: draft.key_issues || null,
              follow_up_actions: draft.follow_up_actions || null,
              investment_opinion: draft.investment_opinion || null,
            })
          }
        >
          저장
        </button>
      </div>
    </div>
  )
}

export default function InternalReviewPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { id } = useParams()
  const { addToast } = useToast()

  const now = new Date()
  const [fundId, setFundId] = useState<number | ''>('')
  const [year, setYear] = useState<number>(now.getFullYear())
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1)

  const selectedId = id ? Number(id) : null

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })
  const { data: rows = [], isLoading: listLoading } = useQuery<InternalReview[]>({
    queryKey: ['internalReviews', fundId, year, quarter],
    queryFn: () =>
      fetchInternalReviews({
        fund_id: fundId === '' ? undefined : fundId,
        year,
        quarter,
      }),
  })
  const { data: detail, isLoading: detailLoading } = useQuery<InternalReview>({
    queryKey: ['internalReview', selectedId],
    queryFn: () => fetchInternalReview(selectedId as number),
    enabled: selectedId != null,
  })

  const createMut = useMutation({
    mutationFn: createInternalReview,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['internalReviews'] })
      queryClient.invalidateQueries({ queryKey: ['internalReview'] })
      addToast('success', '내부보고회를 생성했습니다.')
      navigate(`/internal-reviews/${created.id}`)
    },
  })

  const patchCompanyMut = useMutation({
    mutationFn: ({
      reviewId,
      companyReviewId,
      payload,
    }: {
      reviewId: number
      companyReviewId: number
      payload: Partial<CompanyReview>
    }) => updateInternalReviewCompanyReview(reviewId, companyReviewId, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['internalReview', vars.reviewId] })
      queryClient.invalidateQueries({ queryKey: ['internalReviews'] })
      addToast('success', '기업별 리뷰를 저장했습니다.')
    },
  })

  const autoEvalMut = useMutation({
    mutationFn: autoEvaluateInternalReview,
    onSuccess: (_, reviewId) => {
      queryClient.invalidateQueries({ queryKey: ['internalReview', reviewId] })
      queryClient.invalidateQueries({ queryKey: ['internalReviews'] })
      addToast('success', '손상 자동평가를 완료했습니다.')
    },
  })

  const completeMut = useMutation({
    mutationFn: (reviewId: number) =>
      completeInternalReview(reviewId, { completed_by: '내부보고회 완료처리', evidence_note: '보고회 완료' }),
    onSuccess: (_, reviewId) => {
      queryClient.invalidateQueries({ queryKey: ['internalReview', reviewId] })
      queryClient.invalidateQueries({ queryKey: ['internalReviews'] })
      queryClient.invalidateQueries({ queryKey: ['complianceObligations'] })
      queryClient.invalidateQueries({ queryKey: ['complianceDashboard'] })
      addToast('success', '내부보고회를 완료 처리했습니다.')
    },
  })
  const generateCompanyReportMut = useMutation({
    mutationFn: async (vars: { reviewId: number; companyReviewId: number; companyName: string }) => {
      const generated = await generateInternalReviewCompanyReportDocument(vars.reviewId, vars.companyReviewId)
      const blob = await downloadGeneratedDocument(generated.document_id)
      return { generated, blob, companyName: vars.companyName }
    },
    onSuccess: ({ generated, blob, companyName }, vars) => {
      downloadBlob(blob, generated.filename)
      queryClient.invalidateQueries({ queryKey: ['generatedDocuments'] })
      addToast('success', `${companyName} 후속관리보고서를 생성했습니다.`)
      queryClient.invalidateQueries({ queryKey: ['internalReview', vars.reviewId] })
    },
  })
  const generateIntegratedReportMut = useMutation({
    mutationFn: async (reviewId: number) => {
      const generated = await generateInternalReviewReportDocument(reviewId)
      const blob = await downloadGeneratedDocument(generated.document_id)
      return { generated, blob }
    },
    onSuccess: ({ generated, blob }, reviewId) => {
      downloadBlob(blob, generated.filename)
      queryClient.invalidateQueries({ queryKey: ['generatedDocuments'] })
      queryClient.invalidateQueries({ queryKey: ['internalReview', reviewId] })
      addToast('success', '통합 보고서를 생성했습니다.')
    },
  })

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter) || (b.id - a.id)),
    [rows],
  )

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">내부보고회</h2>
          <p className="page-subtitle">분기별 피투자사 리뷰를 생성하고 손상평가/의견을 관리합니다.</p>
        </div>
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">내부보고회 생성</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
            <select
              className="form-input"
              value={fundId}
              onChange={(event) => setFundId(event.target.value ? Number(event.target.value) : '')}
            >
              <option value="">조합 선택</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">연도</label>
            <input
              type="number"
              className="form-input"
              value={year}
              onChange={(event) => setYear(Number(event.target.value || now.getFullYear()))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">분기</label>
            <select
              className="form-input"
              value={quarter}
              onChange={(event) => setQuarter(Number(event.target.value))}
            >
              {quarterOptions().map((value) => (
                <option key={value} value={value}>{value}Q</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              className="primary-btn"
              disabled={createMut.isPending}
              onClick={() => {
                if (!fundId) {
                  addToast('warning', '조합을 선택해 주세요.')
                  return
                }
                createMut.mutate({ fund_id: fundId, year, quarter })
              }}
            >
              생성
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="card-base">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">목록</h3>
          {listLoading ? (
            <PageLoading />
          ) : !sortedRows.length ? (
            <EmptyState emoji="🗂️" message="내부보고회가 없습니다." className="py-8" />
          ) : (
            <div className="space-y-2">
              {sortedRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`w-full rounded border p-2 text-left ${selectedId === row.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}
                  onClick={() => navigate(`/internal-reviews/${row.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800">{row.fund_name}</p>
                    <span className={badgeClass(row.status)}>{statusLabel(row.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{row.year}년 {row.quarter}분기 · 기준일 {row.reference_date || '-'}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card-base">
          {!selectedId ? (
            <EmptyState emoji="📋" message="목록에서 내부보고회를 선택해 주세요." className="py-12" />
          ) : detailLoading || !detail ? (
            <PageLoading />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-800">
                    {detail.fund_name} · {detail.year}년 {detail.quarter}분기
                  </h3>
                  <p className="text-xs text-gray-500">
                    기준일 {detail.reference_date || '-'} · 보고회일 {detail.review_date || '-'} · 의무연결 {detail.obligation_id || '-'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    className="secondary-btn btn-sm"
                    disabled={autoEvalMut.isPending}
                    onClick={() => autoEvalMut.mutate(detail.id)}
                  >
                    전체 자동평가
                  </button>
                  <button
                    className="secondary-btn btn-sm"
                    disabled={generateIntegratedReportMut.isPending}
                    onClick={() => generateIntegratedReportMut.mutate(detail.id)}
                  >
                    통합 보고서 생성
                  </button>
                  <button
                    className="primary-btn btn-sm"
                    disabled={completeMut.isPending}
                    onClick={() => completeMut.mutate(detail.id)}
                  >
                    완료 처리
                  </button>
                </div>
              </div>

              {!detail.company_reviews?.length ? (
                <EmptyState emoji="🏢" message="생성된 기업 리뷰가 없습니다." className="py-8" />
              ) : (
                <div className="space-y-2">
                  {detail.company_reviews.map((companyRow) => (
                    <CompanyReviewCard
                      key={companyRow.id}
                      row={companyRow}
                      loading={patchCompanyMut.isPending}
                      reportLoading={
                        generateCompanyReportMut.isPending
                        && generateCompanyReportMut.variables?.companyReviewId === companyRow.id
                      }
                      onGenerateReport={() =>
                        generateCompanyReportMut.mutate({
                          reviewId: detail.id,
                          companyReviewId: companyRow.id,
                          companyName: companyRow.company_name,
                        })
                      }
                      onSave={(payload) =>
                        patchCompanyMut.mutate({
                          reviewId: detail.id,
                          companyReviewId: companyRow.id,
                          payload,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
