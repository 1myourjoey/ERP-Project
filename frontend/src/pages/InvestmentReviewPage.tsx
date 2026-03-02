import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  convertInvestmentReview,
  createInvestmentReview,
  createReviewComment,
  deleteInvestmentReview,
  deleteReviewComment,
  downloadGeneratedDocument,
  fetchFunds,
  fetchInvestmentReview,
  fetchInvestmentReviews,
  fetchInvestmentReviewWeeklySummary,
  generateDocumentByBuilder,
  updateInvestmentReview,
  updateInvestmentReviewStatus,
  type Fund,
  type InvestmentReview,
  type InvestmentReviewInput,
  type InvestmentReviewWeeklySummary,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import PageLoading from '../components/PageLoading'
import EmptyState from '../components/EmptyState'
import { invalidateFundRelated } from '../lib/queryInvalidation'
import { formatKRW } from '../lib/labels'

const PIPELINE_STATUSES = ['소싱', '검토중', '실사중', '상정', '의결', '집행', '완료', '중단'] as const

const EMPTY_INPUT: InvestmentReviewInput = {
  company_name: '',
  sector: '',
  stage: '',
  deal_source: '',
  reviewer: '',
  status: '소싱',
  target_amount: null,
  pre_valuation: null,
  post_valuation: null,
  instrument: '',
  fund_id: null,
  review_start_date: null,
  dd_start_date: null,
  committee_date: null,
  decision_date: null,
  execution_date: null,
  review_opinion: '',
  committee_opinion: '',
  decision_result: '',
  rejection_reason: '',
}

function toDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
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

function ReviewForm({
  funds,
  value,
  loading,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: {
  funds: Fund[]
  value: InvestmentReviewInput
  loading: boolean
  submitLabel: string
  onChange: (next: InvestmentReviewInput) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">기업명</label>
          <input
            value={value.company_name}
            onChange={(e) => onChange({ ...value, company_name: e.target.value })}
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">업종</label>
          <input
            value={value.sector || ''}
            onChange={(e) => onChange({ ...value, sector: e.target.value })}
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">단계</label>
          <input
            value={value.stage || ''}
            onChange={(e) => onChange({ ...value, stage: e.target.value })}
            placeholder="Seed / Pre-A / Series A"
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">심사역</label>
          <input
            value={value.reviewer || ''}
            onChange={(e) => onChange({ ...value, reviewer: e.target.value })}
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">소싱 경로</label>
          <input
            value={value.deal_source || ''}
            onChange={(e) => onChange({ ...value, deal_source: e.target.value })}
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">조합</label>
          <select
            value={value.fund_id || ''}
            onChange={(e) => onChange({ ...value, fund_id: e.target.value ? Number(e.target.value) : null })}
            className="form-input"
          >
            <option value="">선택</option>
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">희망 투자금액</label>
          <input
            type="number"
            value={value.target_amount ?? ''}
            onChange={(e) => onChange({ ...value, target_amount: parseNumber(e.target.value) })}
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">투자수단</label>
          <input
            value={value.instrument || ''}
            onChange={(e) => onChange({ ...value, instrument: e.target.value })}
            placeholder="보통주/RCPS/CB"
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">의결 결과</label>
          <select
            value={value.decision_result || ''}
            onChange={(e) => onChange({ ...value, decision_result: e.target.value })}
            className="form-input"
          >
            <option value="">미정</option>
            <option value="승인">승인</option>
            <option value="반려">반려</option>
            <option value="보류">보류</option>
            <option value="조건부승인">조건부승인</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">심사 의견</label>
          <textarea
            value={value.review_opinion || ''}
            onChange={(e) => onChange({ ...value, review_opinion: e.target.value })}
            rows={3}
            className="form-input"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="primary-btn" disabled={loading} onClick={onSubmit}>
          {loading ? '저장 중...' : submitLabel}
        </button>
        <button className="secondary-btn" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  )
}

export default function InvestmentReviewPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [newForm, setNewForm] = useState<InvestmentReviewInput>(EMPTY_INPUT)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newComment, setNewComment] = useState('')
  const [summaryMode, setSummaryMode] = useState(false)
  const [editForm, setEditForm] = useState<InvestmentReviewInput | null>(null)

  const { data: funds = [] } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: rows = [], isLoading } = useQuery<InvestmentReview[]>({
    queryKey: ['investmentReviews', statusFilter],
    queryFn: () => fetchInvestmentReviews({ status: statusFilter || undefined }),
  })
  const { data: summary } = useQuery<InvestmentReviewWeeklySummary>({
    queryKey: ['investmentReviewWeeklySummary'],
    queryFn: fetchInvestmentReviewWeeklySummary,
  })
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['investmentReview', selectedId],
    queryFn: () => fetchInvestmentReview(selectedId as number),
    enabled: !!selectedId,
  })

  useEffect(() => {
    if (!detail) return
    setEditForm({
      company_name: detail.company_name,
      sector: detail.sector,
      stage: detail.stage,
      deal_source: detail.deal_source,
      reviewer: detail.reviewer,
      status: detail.status,
      target_amount: detail.target_amount,
      pre_valuation: detail.pre_valuation,
      post_valuation: detail.post_valuation,
      instrument: detail.instrument,
      fund_id: detail.fund_id,
      review_start_date: detail.review_start_date,
      dd_start_date: detail.dd_start_date,
      committee_date: detail.committee_date,
      decision_date: detail.decision_date,
      execution_date: detail.execution_date,
      review_opinion: detail.review_opinion,
      committee_opinion: detail.committee_opinion,
      decision_result: detail.decision_result,
      rejection_reason: detail.rejection_reason,
      investment_id: detail.investment_id,
    })
  }, [detail])

  const grouped = useMemo(() => {
    const map = new Map<string, InvestmentReview[]>()
    for (const status of PIPELINE_STATUSES) {
      map.set(status, [])
    }
    for (const row of rows) {
      const key = row.status || '소싱'
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return map
  }, [rows])

  const createMut = useMutation({
    mutationFn: (data: InvestmentReviewInput) => createInvestmentReview(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investmentReviews'] })
      queryClient.invalidateQueries({ queryKey: ['investmentReviewWeeklySummary'] })
      setShowCreate(false)
      setNewForm(EMPTY_INPUT)
      addToast('success', '심의 건을 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InvestmentReviewInput> }) =>
      updateInvestmentReview(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['investmentReviews'] })
      queryClient.invalidateQueries({ queryKey: ['investmentReview', updated.id] })
      queryClient.invalidateQueries({ queryKey: ['investmentReviewWeeklySummary'] })
      invalidateFundRelated(queryClient, updated.fund_id)
      addToast('success', '심의 정보를 수정했습니다.')
    },
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateInvestmentReviewStatus(id, status),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['investmentReviews'] })
      queryClient.invalidateQueries({ queryKey: ['investmentReview', updated.id] })
      queryClient.invalidateQueries({ queryKey: ['investmentReviewWeeklySummary'] })
      addToast('success', '상태를 변경했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInvestmentReview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investmentReviews'] })
      queryClient.invalidateQueries({ queryKey: ['investmentReviewWeeklySummary'] })
      setSelectedId(null)
      addToast('success', '심의 건을 삭제했습니다.')
    },
  })

  const convertMut = useMutation({
    mutationFn: (id: number) => convertInvestmentReview(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['investmentReviews'] })
      queryClient.invalidateQueries({ queryKey: ['investmentReview', result.review_id] })
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      addToast('success', `투자 전환 완료 (#${result.investment_id})`)
    },
  })
  const generateMinutesMut = useMutation({
    mutationFn: async (reviewId: number) => {
      const generated = await generateDocumentByBuilder({
        builder: 'irc_minutes',
        params: { investment_review_id: reviewId },
      })
      const blob = await downloadGeneratedDocument(generated.document_id)
      return { generated, blob }
    },
    onSuccess: ({ generated, blob }) => {
      downloadBlob(blob, generated.filename)
      queryClient.invalidateQueries({ queryKey: ['generatedDocuments'] })
      addToast('success', '투심위 의사록을 생성했습니다.')
    },
  })

  const commentMut = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      createReviewComment(id, { author: '담당자', content }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['investmentReview', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['investmentReviews'] })
      queryClient.invalidateQueries({ queryKey: ['investmentReviewWeeklySummary'] })
      setNewComment('')
      addToast('success', '코멘트를 추가했습니다.')
    },
  })

  const deleteCommentMut = useMutation({
    mutationFn: (commentId: number) => deleteReviewComment(commentId),
    onSuccess: () => {
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: ['investmentReview', selectedId] })
      }
      queryClient.invalidateQueries({ queryKey: ['investmentReviews'] })
      queryClient.invalidateQueries({ queryKey: ['investmentReviewWeeklySummary'] })
      addToast('success', '코멘트를 삭제했습니다.')
    },
  })

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">투자 심의</h2>
          <p className="page-subtitle">소싱부터 집행/완료까지 심의 파이프라인을 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="secondary-btn" onClick={() => setSummaryMode((prev) => !prev)}>
            {summaryMode ? '보드 보기' : '주간 요약'}
          </button>
          <button className="primary-btn" onClick={() => setShowCreate((prev) => !prev)}>
            + 신규 심의
          </button>
        </div>
      </div>

      <div className="card-base">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-600">상태 필터</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">전체</option>
            {PIPELINE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button className="secondary-btn btn-sm" onClick={() => setStatusFilter('')}>
            초기화
          </button>
        </div>
      </div>

      {showCreate && (
        <ReviewForm
          funds={funds}
          value={newForm}
          loading={createMut.isPending}
          submitLabel="등록"
          onChange={setNewForm}
          onSubmit={() => {
            if (!newForm.company_name.trim()) {
              addToast('error', '기업명을 입력하세요.')
              return
            }
            createMut.mutate({
              ...newForm,
              company_name: newForm.company_name.trim(),
              sector: newForm.sector?.trim() || null,
              stage: newForm.stage?.trim() || null,
              deal_source: newForm.deal_source?.trim() || null,
              reviewer: newForm.reviewer?.trim() || null,
              instrument: newForm.instrument?.trim() || null,
              review_opinion: newForm.review_opinion?.trim() || null,
              committee_opinion: newForm.committee_opinion?.trim() || null,
              rejection_reason: newForm.rejection_reason?.trim() || null,
              decision_result: newForm.decision_result?.trim() || null,
            })
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {summaryMode ? (
        <div className="card-base space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">주간 요약</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-xs text-slate-500">금주 신규</p>
              <p className="text-lg font-semibold text-slate-900">{summary?.new_count ?? 0}</p>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-xs text-slate-500">상태 변경</p>
              <p className="text-lg font-semibold text-slate-900">{summary?.status_changed_count ?? 0}</p>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-xs text-slate-500">코멘트 추가</p>
              <p className="text-lg font-semibold text-slate-900">{summary?.comments_added_count ?? 0}</p>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-xs text-slate-500">전체 건수</p>
              <p className="text-lg font-semibold text-slate-900">{rows.length}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {PIPELINE_STATUSES.map((status) => (
              <div key={status} className="rounded border p-2 text-sm">
                <span className="text-slate-500">{status}</span>
                <span className="ml-2 font-semibold text-slate-800">{summary?.status_counts?.[status] ?? 0}</span>
              </div>
            ))}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-slate-600">최근 활동</h4>
            {!summary?.recent_activities?.length ? (
              <EmptyState emoji="📝" message="최근 활동이 없습니다." className="py-6" />
            ) : (
              <div className="space-y-2">
                {summary.recent_activities.map((activity) => (
                  <div key={activity.review_id} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm">
                    <div className="font-medium text-slate-800">{activity.company_name}</div>
                    <div className="text-xs text-slate-500">
                      상태 {activity.status} · 코멘트 {activity.comment_count}건 · {toDate(activity.updated_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="card-base overflow-x-auto">
            {isLoading ? (
              <PageLoading />
            ) : (
              <div className="grid min-w-[1200px] grid-cols-8 gap-3">
                {PIPELINE_STATUSES.map((status) => {
                  const statusRows = grouped.get(status) || []
                  return (
                    <div key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <p className="mb-2 text-xs font-semibold text-slate-700">
                        {status} ({statusRows.length})
                      </p>
                      <div className="space-y-2">
                        {statusRows.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => setSelectedId(row.id)}
                            className={`w-full rounded-lg border px-2 py-2 text-left text-xs transition ${
                              selectedId === row.id
                                ? 'border-blue-300 bg-blue-50'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <p className="font-semibold text-slate-800">{row.company_name}</p>
                            <p className="mt-0.5 text-slate-500">{row.sector || '-'}</p>
                            <p className="mt-0.5 text-slate-500">{formatKRW(row.target_amount)}</p>
                            <p className="mt-0.5 text-slate-500">{row.reviewer || '-'}</p>
                          </button>
                        ))}
                        {!statusRows.length && <p className="rounded border border-dashed p-2 text-[11px] text-slate-500">없음</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card-base">
            {!selectedId ? (
              <EmptyState emoji="🧾" message="카드를 선택하면 상세 정보를 볼 수 있습니다." className="py-10" />
            ) : detailLoading || !detail ? (
              <PageLoading />
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{detail.company_name}</p>
                    <p className="text-xs text-slate-500">
                      {detail.sector || '-'} · {detail.stage || '-'} · {detail.reviewer || '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      value={detail.status}
                      onChange={(e) => statusMut.mutate({ id: detail.id, status: e.target.value })}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      {PIPELINE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      className="danger-btn btn-sm"
                      onClick={() => {
                        if (confirm('이 심의 건을 삭제하시겠습니까?')) {
                          deleteMut.mutate(detail.id)
                        }
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className="rounded border bg-slate-50 p-2 text-xs text-slate-700">
                  <p>희망 투자금액: {formatKRW(detail.target_amount)}</p>
                  <p>투자수단: {detail.instrument || '-'}</p>
                  <p>의결 결과: {detail.decision_result || '-'}</p>
                  <p>투자 전환 ID: {detail.investment_id || '-'}</p>
                </div>

                {editForm && (
                  <ReviewForm
                    funds={funds}
                    value={editForm}
                    loading={updateMut.isPending}
                    submitLabel="수정 저장"
                    onChange={setEditForm}
                    onSubmit={() => {
                      updateMut.mutate({ id: detail.id, data: editForm })
                    }}
                    onCancel={() => {
                      setEditForm({
                        company_name: detail.company_name,
                        sector: detail.sector,
                        stage: detail.stage,
                        deal_source: detail.deal_source,
                        reviewer: detail.reviewer,
                        status: detail.status,
                        target_amount: detail.target_amount,
                        pre_valuation: detail.pre_valuation,
                        post_valuation: detail.post_valuation,
                        instrument: detail.instrument,
                        fund_id: detail.fund_id,
                        review_start_date: detail.review_start_date,
                        dd_start_date: detail.dd_start_date,
                        committee_date: detail.committee_date,
                        decision_date: detail.decision_date,
                        execution_date: detail.execution_date,
                        review_opinion: detail.review_opinion,
                        committee_opinion: detail.committee_opinion,
                        decision_result: detail.decision_result,
                        rejection_reason: detail.rejection_reason,
                        investment_id: detail.investment_id,
                      })
                    }}
                  />
                )}

                <div className="flex gap-2">
                  <button
                    className="primary-btn"
                    disabled={convertMut.isPending}
                    onClick={() => convertMut.mutate(detail.id)}
                  >
                    투자 전환
                  </button>
                  <button
                    className="secondary-btn"
                    disabled={generateMinutesMut.isPending}
                    onClick={() => generateMinutesMut.mutate(detail.id)}
                  >
                    투심위 의사록 생성
                  </button>
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600">코멘트</p>
                  <div className="mb-2 space-y-2">
                    {detail.comments?.length ? (
                      detail.comments.map((comment) => (
                        <div key={comment.id} className="rounded border border-slate-200 bg-white p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">
                              {comment.author} · {comment.comment_type}
                            </span>
                            <button
                              className="text-red-600 hover:underline"
                              onClick={() => deleteCommentMut.mutate(comment.id)}
                            >
                              삭제
                            </button>
                          </div>
                          <p className="mt-1 text-slate-700">{comment.content}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{toDate(comment.created_at)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">코멘트가 없습니다.</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="코멘트 입력"
                      className="form-input"
                    />
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        if (!newComment.trim()) return
                        commentMut.mutate({ id: detail.id, content: newComment.trim() })
                      }}
                    >
                      추가
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


