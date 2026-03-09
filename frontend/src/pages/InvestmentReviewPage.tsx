import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import { useToast } from '../contexts/ToastContext'
import {
  convertInvestmentReview,
  createInvestmentReview,
  createReviewComment,
  deleteInvestmentReview,
  deleteReviewComment,
  downloadGeneratedDocument,
  fetchFunds,
  fetchInvestmentReview,
  fetchInvestmentReviewWeeklySummary,
  fetchInvestmentReviews,
  generateDocumentByBuilder,
  updateInvestmentReview,
  updateInvestmentReviewStatus,
  type Fund,
  type InvestmentReview,
  type InvestmentReviewConvertInput,
  type InvestmentReviewDetail,
  type InvestmentReviewInput,
  type InvestmentReviewWeeklySummary,
} from '../lib/api'
import { invalidateFundRelated } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'
import { formatKRW } from '../lib/labels'

const ACTIVE_STATUSES = ['소싱', '검토중', '실사중', '상정', '의결', '집행'] as const
const STATUS_OPTIONS = [...ACTIVE_STATUSES, '완료', '중단'] as const

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

const EMPTY_CONVERT_INPUT: InvestmentReviewConvertInput = {
  fund_id: 0,
  investment_date: null,
  amount: null,
  instrument: null,
  shares: null,
  share_price: null,
  valuation: null,
  round: null,
  valuation_pre: null,
  valuation_post: null,
  ownership_pct: null,
  board_seat: null,
  contribution_rate: null,
  status: 'active',
}

function toDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

function stageDate(row: InvestmentReview, stage: (typeof ACTIVE_STATUSES)[number]) {
  if (stage === '소싱') return row.created_at
  if (stage === '검토중') return row.review_start_date
  if (stage === '실사중') return row.dd_start_date
  if (stage === '상정') return row.committee_date
  if (stage === '의결') return row.decision_date
  return row.execution_date
}

function stageIndex(status: string) {
  return ACTIVE_STATUSES.indexOf((status || '소싱') as (typeof ACTIVE_STATUSES)[number])
}

function nextAction(row: InvestmentReview) {
  if (row.status === '소싱') return row.review_start_date ? '검토 진행중' : '검토 시작일 입력'
  if (row.status === '검토중') return row.dd_start_date ? '실사 진행중' : '실사 시작일 입력'
  if (row.status === '실사중') return row.committee_date ? `투심위 ${toDate(row.committee_date)}` : '투심위 일정 입력'
  if (row.status === '상정') return row.decision_date ? `의결 ${toDate(row.decision_date)}` : '의결일 입력'
  if (row.status === '의결') return row.execution_date ? `집행 ${toDate(row.execution_date)}` : '집행 예정일 입력'
  if (row.status === '집행') return row.investment_id ? `투자 #${row.investment_id}` : '투자 전환 필요'
  return row.status
}

function normalizeInput(form: InvestmentReviewInput): InvestmentReviewInput {
  return {
    ...form,
    company_name: form.company_name.trim(),
    sector: form.sector?.trim() || null,
    stage: form.stage?.trim() || null,
    deal_source: form.deal_source?.trim() || null,
    reviewer: form.reviewer?.trim() || null,
    instrument: form.instrument?.trim() || null,
    review_opinion: form.review_opinion?.trim() || null,
    committee_opinion: form.committee_opinion?.trim() || null,
    decision_result: form.decision_result?.trim() || null,
    rejection_reason: form.rejection_reason?.trim() || null,
  }
}

function buildEditForm(detail: InvestmentReviewDetail): InvestmentReviewInput {
  return {
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
  }
}

function buildConvertForm(detail: InvestmentReviewDetail): InvestmentReviewConvertInput {
  return {
    fund_id: detail.fund_id ?? 0,
    investment_date: detail.execution_date || detail.decision_date || null,
    amount: detail.target_amount,
    instrument: detail.instrument,
    shares: null,
    share_price: null,
    valuation: detail.post_valuation,
    round: detail.stage,
    valuation_pre: detail.pre_valuation,
    valuation_post: detail.post_valuation,
    ownership_pct: null,
    board_seat: null,
    contribution_rate: null,
    status: 'active',
  }
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
    <div className="rounded-[28px] border border-[#d8e5fb] bg-[#fbfdff] p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">기업명</label>
          <input value={value.company_name} onChange={(e) => onChange({ ...value, company_name: e.target.value })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">업종</label>
          <input value={value.sector || ''} onChange={(e) => onChange({ ...value, sector: e.target.value })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">라운드/단계</label>
          <input value={value.stage || ''} onChange={(e) => onChange({ ...value, stage: e.target.value })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">심사역</label>
          <input value={value.reviewer || ''} onChange={(e) => onChange({ ...value, reviewer: e.target.value })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">소싱 경로</label>
          <input value={value.deal_source || ''} onChange={(e) => onChange({ ...value, deal_source: e.target.value })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
          <select value={value.fund_id || ''} onChange={(e) => onChange({ ...value, fund_id: e.target.value ? Number(e.target.value) : null })} className="form-input">
            <option value="">선택</option>
            {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
          <select value={value.status || '소싱'} onChange={(e) => onChange({ ...value, status: e.target.value })} className="form-input">
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">희망 투자금액</label>
          <input type="number" value={value.target_amount ?? ''} onChange={(e) => onChange({ ...value, target_amount: parseNumber(e.target.value) })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">투자수단</label>
          <input value={value.instrument || ''} onChange={(e) => onChange({ ...value, instrument: e.target.value })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">검토 시작일</label>
          <input type="date" value={value.review_start_date || ''} onChange={(e) => onChange({ ...value, review_start_date: e.target.value || null })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">실사 시작일</label>
          <input type="date" value={value.dd_start_date || ''} onChange={(e) => onChange({ ...value, dd_start_date: e.target.value || null })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">투심위 일정</label>
          <input type="date" value={value.committee_date || ''} onChange={(e) => onChange({ ...value, committee_date: e.target.value || null })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">의결일</label>
          <input type="date" value={value.decision_date || ''} onChange={(e) => onChange({ ...value, decision_date: e.target.value || null })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">집행일</label>
          <input type="date" value={value.execution_date || ''} onChange={(e) => onChange({ ...value, execution_date: e.target.value || null })} className="form-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">의결 결과</label>
          <select value={value.decision_result || ''} onChange={(e) => onChange({ ...value, decision_result: e.target.value })} className="form-input">
            <option value="">미정</option>
            <option value="승인">승인</option>
            <option value="조건부승인">조건부승인</option>
            <option value="보류">보류</option>
            <option value="반려">반려</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-medium text-[#64748b]">심사 의견</label>
          <textarea value={value.review_opinion || ''} onChange={(e) => onChange({ ...value, review_opinion: e.target.value })} rows={3} className="form-input" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className="primary-btn" disabled={loading} onClick={onSubmit}>{loading ? '저장 중...' : submitLabel}</button>
        <button type="button" className="secondary-btn" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

function ConvertModal({
  open,
  detail,
  funds,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean
  detail: InvestmentReviewDetail | null
  funds: Fund[]
  loading: boolean
  onClose: () => void
  onSubmit: (input: InvestmentReviewConvertInput) => void
}) {
  const [form, setForm] = useState<InvestmentReviewConvertInput>(EMPTY_CONVERT_INPUT)

  useEffect(() => {
    if (open && detail) setForm(buildConvertForm(detail))
  }, [detail, open])

  if (!open || !detail) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4" onClick={onClose}>
      <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-[#d8e5fb] bg-white p-6 shadow-[0_24px_80px_rgba(15,31,61,0.22)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#1a3660]">투자 등록 연계</p>
            <h3 className="mt-2 text-xl font-semibold text-[#0f1f3d]">투자 전환</h3>
            <p className="mt-1 text-sm text-[#64748b]">투자등록과 같은 방식으로 조합과 집행 값을 입력하면 자동 귀속됩니다.</p>
          </div>
          <button type="button" className="secondary-btn btn-sm" onClick={onClose}>닫기</button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
            <select value={form.fund_id || ''} onChange={(e) => setForm({ ...form, fund_id: e.target.value ? Number(e.target.value) : 0 })} className="form-input">
              <option value="">선택</option>
              {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">투자일</label>
            <input type="date" value={form.investment_date || ''} onChange={(e) => setForm({ ...form, investment_date: e.target.value || null })} className="form-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">투자금액</label>
            <input type="number" value={form.amount ?? ''} onChange={(e) => setForm({ ...form, amount: parseNumber(e.target.value) })} className="form-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">투자수단</label>
            <input value={form.instrument || ''} onChange={(e) => setForm({ ...form, instrument: e.target.value || null })} className="form-input" />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" className="primary-btn" disabled={loading || !form.fund_id || !form.investment_date} onClick={() => onSubmit(form)}>{loading ? '전환 중...' : '투자 전환 저장'}</button>
          <button type="button" className="secondary-btn" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

export default function InvestmentReviewPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newForm, setNewForm] = useState<InvestmentReviewInput>(EMPTY_INPUT)
  const [editForm, setEditForm] = useState<InvestmentReviewInput | null>(null)
  const [commentText, setCommentText] = useState('')
  const [convertOpen, setConvertOpen] = useState(false)

  const filters = useMemo(() => ({ status: statusFilter || undefined }), [statusFilter])
  const { data: funds = [] } = useQuery({ queryKey: queryKeys.funds.all, queryFn: fetchFunds })
  const { data: rows = [], isLoading } = useQuery({ queryKey: queryKeys.investmentReviews.list(filters), queryFn: () => fetchInvestmentReviews(filters) })
  const { data: summary } = useQuery({ queryKey: queryKeys.investmentReviews.weeklySummary, queryFn: fetchInvestmentReviewWeeklySummary })
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: selectedId ? queryKeys.investmentReviews.detail(selectedId) : [...queryKeys.investmentReviews.all, 'empty'],
    queryFn: () => fetchInvestmentReview(selectedId as number),
    enabled: selectedId != null,
  })

  useEffect(() => {
    if (!selectedId && rows.length > 0) setSelectedId(rows[0].id)
  }, [rows, selectedId])

  useEffect(() => {
    if (detail) setEditForm(buildEditForm(detail))
  }, [detail])

  const activeRows = rows.filter((row) => row.status !== '완료' && row.status !== '중단')
  const completedRows = rows.filter((row) => row.status === '완료')
  const stoppedRows = rows.filter((row) => row.status === '중단')

  const createMut = useMutation({
    mutationFn: (input: InvestmentReviewInput) => createInvestmentReview(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.all })
      setShowCreate(false)
      setNewForm(EMPTY_INPUT)
      addToast('success', '심의 건을 등록했습니다.')
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: InvestmentReviewInput }) => updateInvestmentReview(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.detail(updated.id) })
      invalidateFundRelated(queryClient, updated.fund_id)
      addToast('success', '심의 정보를 수정했습니다.')
    },
  })
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateInvestmentReviewStatus(id, status),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.detail(updated.id) })
    },
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInvestmentReview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.all })
      setSelectedId(null)
      addToast('success', '심의 건을 삭제했습니다.')
    },
  })
  const convertMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: InvestmentReviewConvertInput }) => convertInvestmentReview(id, data),
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.detail(result.review_id) })
      invalidateFundRelated(queryClient, vars.data.fund_id)
      setConvertOpen(false)
      addToast('success', `투자 전환 완료 #${result.investment_id}`)
    },
  })
  const minutesMut = useMutation({
    mutationFn: async (reviewId: number) => {
      const generated = await generateDocumentByBuilder({ builder: 'irc_minutes', params: { investment_review_id: reviewId } })
      const blob = await downloadGeneratedDocument(generated.document_id)
      return { generated, blob }
    },
    onSuccess: ({ generated, blob }) => {
      downloadBlob(blob, generated.filename)
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.generated })
      addToast('success', '투심위 의사록을 생성했습니다.')
    },
  })
  const commentMut = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) => createReviewComment(id, { author: '담당자', content }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.detail(vars.id) })
      setCommentText('')
    },
  })
  const deleteCommentMut = useMutation({
    mutationFn: (commentId: number) => deleteReviewComment(commentId),
    onSuccess: () => {
      if (selectedId) queryClient.invalidateQueries({ queryKey: queryKeys.investmentReviews.detail(selectedId) })
    },
  })

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="투자 심의"
        subtitle="진행 중 심의는 한 줄 타임라인으로, 완료와 중단은 별도 레인으로 분리해 확인합니다."
        actions={(
          <div className="flex items-center gap-2">
            <button type="button" className="secondary-btn" onClick={() => setShowSummary((prev) => !prev)}>{showSummary ? '타임라인 보기' : '주간 요약'}</button>
            <button type="button" className="primary-btn" onClick={() => setShowCreate((prev) => !prev)}>신규 심의</button>
          </div>
        )}
      />

      <PageMetricStrip
        items={[
          { label: '진행 중', value: `${activeRows.length}건`, hint: '소싱 ~ 집행', tone: 'info' },
          { label: '완료', value: `${completedRows.length}건`, hint: '투자 등록 연계 완료', tone: 'success' },
          { label: '중단', value: `${stoppedRows.length}건`, hint: '별도 레인', tone: stoppedRows.length ? 'danger' : 'default' },
          { label: '승인', value: `${rows.filter((row) => row.decision_result === '승인').length}건`, hint: '투자 전환 가능 후보', tone: 'warning' },
        ]}
      />

      <PageControlStrip compact>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-[#64748b]">상태 필터</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-input max-w-[180px]">
            <option value="">전체</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </PageControlStrip>

      {showCreate ? (
        <ReviewForm
          funds={funds}
          value={newForm}
          loading={createMut.isPending}
          submitLabel="심의 등록"
          onChange={setNewForm}
          onSubmit={() => newForm.company_name.trim() ? createMut.mutate(normalizeInput(newForm)) : addToast('warning', '기업명을 입력하세요.')}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}

      {showSummary ? (
        <SectionScaffold title="주간 요약" description="최근 7일 활동입니다.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-[#d8e5fb] bg-[#fbfdff] p-3"><p className="text-xs text-[#64748b]">금주 신규</p><p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{(summary as InvestmentReviewWeeklySummary | undefined)?.new_count ?? 0}</p></div>
            <div className="rounded-2xl border border-[#d8e5fb] bg-[#fbfdff] p-3"><p className="text-xs text-[#64748b]">상태 변경</p><p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{(summary as InvestmentReviewWeeklySummary | undefined)?.status_changed_count ?? 0}</p></div>
            <div className="rounded-2xl border border-[#d8e5fb] bg-[#fbfdff] p-3"><p className="text-xs text-[#64748b]">코멘트 추가</p><p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{(summary as InvestmentReviewWeeklySummary | undefined)?.comments_added_count ?? 0}</p></div>
            <div className="rounded-2xl border border-[#d8e5fb] bg-[#fbfdff] p-3"><p className="text-xs text-[#64748b]">전체 건수</p><p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{rows.length}</p></div>
          </div>
        </SectionScaffold>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(360px,1fr)]">
          <div className="space-y-4">
            <SectionScaffold title="진행 중 타임라인" description="날짜가 비어 있으면 바로 입력이 필요한 단계입니다.">
              {isLoading ? <PageLoading /> : activeRows.length === 0 ? <EmptyState message="진행 중 심의가 없습니다." className="py-8" /> : (
                <div className="space-y-3">
                  {activeRows.map((row) => (
                    <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`w-full rounded-[28px] border text-left ${selectedId === row.id ? 'border-[#aac6fa] bg-[#f8fbff]' : 'border-[#d8e5fb] bg-white hover:bg-[#fbfdff]'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eef3fb] px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-[#0f1f3d]">{row.company_name}</p>
                          <p className="mt-1 text-xs text-[#64748b]">{row.reviewer || '담당 미지정'} · {formatKRW(row.target_amount)}</p>
                        </div>
                        <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-1 text-[11px] font-semibold text-[#1a3660]">{nextAction(row)}</span>
                      </div>
                      <div className="grid gap-2 px-4 py-4 md:grid-cols-6">
                        {ACTIVE_STATUSES.map((status, index) => {
                          const current = stageIndex(row.status) === index
                          const done = stageIndex(row.status) > index
                          return (
                            <div key={`${row.id}-${status}`} className={`rounded-2xl border px-3 py-3 ${current ? 'border-[#7aa5f8] bg-[#edf4ff]' : done ? 'border-[#c5d8fb] bg-[#f5f9ff]' : 'border-[#e6edf8] bg-white'}`}>
                              <p className="text-xs font-semibold text-[#0f1f3d]">{status}</p>
                              <p className="mt-2 text-xs text-[#64748b]">{toDate(stageDate(row, status)) === '-' ? '날짜 입력 필요' : toDate(stageDate(row, status))}</p>
                            </div>
                          )
                        })}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SectionScaffold>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionScaffold title="완료 레인" description="완료 건 분리">
                {!completedRows.length ? <EmptyState message="완료된 심의 건이 없습니다." className="py-8" /> : completedRows.map((row) => (
                  <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className="mb-2 flex w-full items-center justify-between rounded-2xl border border-[#d8e5fb] bg-white px-4 py-3 text-left hover:bg-[#f8fbff]">
                    <div><p className="text-sm font-semibold text-[#0f1f3d]">{row.company_name}</p><p className="mt-1 text-xs text-[#64748b]">집행 {toDate(row.execution_date)}</p></div>
                    <span className="tag tag-green">완료</span>
                  </button>
                ))}
              </SectionScaffold>
              <SectionScaffold title="중단 레인" description="중단 건 분리">
                {!stoppedRows.length ? <EmptyState message="중단된 심의 건이 없습니다." className="py-8" /> : stoppedRows.map((row) => (
                  <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className="mb-2 flex w-full items-start justify-between rounded-2xl border border-[#f1d0d4] bg-white px-4 py-3 text-left hover:bg-[#fff8f8]">
                    <div><p className="text-sm font-semibold text-[#0f1f3d]">{row.company_name}</p><p className="mt-1 text-xs text-[#64748b]">{row.rejection_reason || '중단 사유 미입력'}</p></div>
                    <span className="tag tag-red">중단</span>
                  </button>
                ))}
              </SectionScaffold>
            </div>
          </div>

          <SectionScaffold title="심의 상세" description="단계 날짜 입력과 투자 전환을 같은 패널에서 처리합니다.">
            {!selectedId ? <EmptyState message="심의 건을 선택하세요." className="py-10" /> : detailLoading || !detail ? <PageLoading /> : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-lg font-semibold text-[#0f1f3d]">{detail.company_name}</p><p className="mt-1 text-xs text-[#64748b]">{detail.sector || '-'} · {detail.stage || '-'} · {detail.reviewer || '담당 미지정'}</p></div>
                  <div className="flex items-center gap-2">
                    <select value={detail.status} onChange={(e) => statusMut.mutate({ id: detail.id, status: e.target.value })} className="form-input-sm min-w-[116px]">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select>
                    <button type="button" className="danger-btn btn-sm" onClick={() => window.confirm('이 심의 건을 삭제하시겠습니까?') && deleteMut.mutate(detail.id)}>삭제</button>
                  </div>
                </div>
                {editForm ? <ReviewForm funds={funds} value={editForm} loading={updateMut.isPending} submitLabel="심의 저장" onChange={setEditForm} onSubmit={() => updateMut.mutate({ id: detail.id, data: normalizeInput(editForm) })} onCancel={() => setEditForm(buildEditForm(detail))} /> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="primary-btn" disabled={convertMut.isPending || detail.decision_result !== '승인'} onClick={() => setConvertOpen(true)}>투자 전환</button>
                  <button type="button" className="secondary-btn" disabled={minutesMut.isPending || !detail.committee_date} onClick={() => minutesMut.mutate(detail.id)}>투심위 의사록 생성</button>
                </div>
                <div className="rounded-2xl border border-[#d8e5fb] bg-[#fbfdff] p-4">
                  <p className="text-sm font-semibold text-[#0f1f3d]">코멘트</p>
                  <div className="mt-3 space-y-2">
                    {detail.comments?.length ? detail.comments.map((comment) => (
                      <div key={comment.id} className="rounded-2xl border border-[#d8e5fb] bg-white p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-[#0f1f3d]">{comment.author} · {comment.comment_type}</p>
                          <button type="button" className="text-[#7a2d36] hover:underline" onClick={() => deleteCommentMut.mutate(comment.id)}>삭제</button>
                        </div>
                        <p className="mt-2 leading-5 text-[#0f1f3d]">{comment.content}</p>
                      </div>
                    )) : <p className="text-xs text-[#64748b]">등록된 코멘트가 없습니다.</p>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="코멘트 입력" className="form-input" />
                    <button type="button" className="secondary-btn" onClick={() => commentText.trim() && commentMut.mutate({ id: detail.id, content: commentText.trim() })}>추가</button>
                  </div>
                </div>
              </div>
            )}
          </SectionScaffold>
        </div>
      )}

      <ConvertModal open={convertOpen} detail={detail ?? null} funds={funds} loading={convertMut.isPending} onClose={() => setConvertOpen(false)} onSubmit={(input) => detail && convertMut.mutate({ id: detail.id, data: input })} />
    </div>
  )
}
