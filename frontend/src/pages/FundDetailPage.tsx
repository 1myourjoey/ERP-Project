import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addFundFormationWorkflow,
  calculateDeadline,
  completeLPTransfer,
  createAssembly,
  createCapitalCallBatch,
  createDistribution,
  createDistributionItem,
  createFundLP,
  createLPTransfer,
  downloadGeneratedDocument,
  deleteAssembly,
  deleteDistribution,
  deleteDistributionItem,
  deleteFund,
  deleteFundLP,
  fetchAssemblies,
  fetchCapitalCalls,
  fetchCapitalCallSummary,
  fetchDistributionItems,
  fetchDistributions,
  fetchDocumentStatus,
  fetchFundMeetingPacketPlan,
  fetchMeetingPacket,
  fetchFeeConfig,
  fetchFeeWaterfall,
  fetchFund,
  fetchLegalDocuments,
  fetchGPEntities,
  fetchInvestments,
  fetchTasks,
  fetchManagementFeesByFund,
  generateMeetingPacket,
  fetchPerformanceFeeSimulations,
  fetchLPTransfers,
  fetchLPAddressBooks,
  fetchValuations,
  fetchWorkflows,
  fetchWorkflowInstances,
  generateDocumentByBuilder,
  prepareMeetingPacket,
  updateMeetingPacket,
  updateAssembly,
  updateDistribution,
  updateDistributionItem,
  updateFund,
  updateFundKeyTerms,
  updateFundLP,
  updateFundNoticePeriods,
  updateLPTransfer,
  type Assembly,
  type AssemblyInput,
  type Distribution,
  type DistributionInput,
  type DistributionItem,
  type DistributionItemInput,
  type DocumentStatusItem,
  type Fund,
  type FundInput,
  type FundKeyTermInput,
  type FundNoticePeriodInput,
  type CapitalCall,
  type CapitalCallSummary,
  type FeeConfigResponse,
  type LP,
  type LPAddressBook,
  type LPInput,
  type LPTransfer,
  type LPTransferInput,
  type GPEntity,
  type LegalDocument,
  type ManagementFeeResponse,
  type MeetingPacketAgendaItemInput,
  type MeetingPacketDraftResponse,
  type MeetingPacketGenerationPlanResponse,
  type NoticeDeadlineResult,
  type PerformanceFeeSimulationResponse,
  type Task,
  type Valuation,
  type WaterfallResponse,
  type WorkflowInstance,
  type WorkflowListItem,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import PageLoading from '../components/PageLoading'
import KrwAmountInput from '../components/common/KrwAmountInput'
import FundDocumentGenerator from '../components/fund/FundDocumentGenerator'
import LPContributionPanel from '../components/fund/LPContributionPanel'
import FundCoreFields from '../components/funds/FundCoreFields'
import WaterfallSummary from '../components/finance/WaterfallSummary'
import { generateLPReport, previewLPReportData } from '../lib/api/lpReports'
import {
  DEFAULT_LP_TYPE,
  groupLpType,
  labelLpType,
  LP_TYPE_SELECT_GROUPS,
  normalizeLpTypeOrFallback,
} from '../lib/lpTypes'
import { invalidateFundRelated } from '../lib/queryInvalidation'

interface FundInvestmentListItem {
  id: number
  company_name?: string
  company_founded_date?: string | null
  industry?: string | null
  investment_date?: string | null
  amount?: number | null
  instrument?: string | null
  status?: string
}

interface EditableNoticePeriod extends FundNoticePeriodInput {
  _row_id: string
}

interface EditableKeyTerm extends FundKeyTermInput {
  _row_id: string
}

interface DistributionEditState {
  dist_date: string
  dist_type: string
  principal_total: number
  profit_total: number
  performance_fee: number
  memo: string
}

interface DistributionItemEditState {
  principal: number
  profit: number
}

interface AssemblyEditState {
  date: string
  type: string
  status: string
  agenda: string
  minutes_completed: boolean
  memo: string
}

const STANDARD_NOTICE_TYPES = [
  { notice_type: 'assembly', label: '총회 소집 통지', default_days: 14 },
  { notice_type: 'capital_call_initial', label: '최초 출자금 납입 요청', default_days: 10 },
  { notice_type: 'capital_call_additional', label: '수시 출자금 납입 요청', default_days: 10 },
  { notice_type: 'ic_agenda', label: '투자심의위원회 안건 통지', default_days: 7 },
  { notice_type: 'distribution', label: '분배 통지', default_days: 5 },
  { notice_type: 'dissolution', label: '해산/청산 통지', default_days: 30 },
  { notice_type: 'lp_report', label: '조합원 보고', default_days: 0 },
  { notice_type: 'amendment', label: '규약 변경 통지', default_days: 14 },
]

const FUND_DETAIL_TABS = [
  { id: 'overview', label: '개요' },
  { id: 'capital_lp', label: '자본 & LP' },
  { id: 'investments', label: '투자' },
  { id: 'finance', label: '재무' },
  { id: 'documents', label: '서류' },
] as const

const MEETING_PACKET_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '자동 추천 사용' },
  { value: 'fund_lp_regular_meeting_pex', label: '조합원총회 + 온기보고회(PEX형)' },
  { value: 'fund_lp_regular_meeting_project', label: '조합원총회(프로젝트형)' },
  { value: 'fund_lp_regular_meeting_project_with_bylaw_amendment', label: '조합원총회(규약변경 포함)' },
  { value: 'gp_shareholders_meeting', label: 'GP 사원총회' },
]

type FundDetailTab = typeof FUND_DETAIL_TABS[number]['id']

const FORMATION_WORKFLOW_BUTTONS = [
  { key: '고유번호증 발급', label: '고유번호증 발급' },
  { key: '수탁계약 체결', label: '수탁계약 체결' },
  { key: '결성총회 개최', label: '결성총회 개최' },
  { key: '벤처투자조합 등록', label: '투자조합 등록' },
]

const FORMING_STATUS_KEYS = new Set([
  'forming',
  'planned',
  '결성예정',
  '결성예정(planned)',
])

const FORMATION_WORKFLOW_STATUS_LABEL: Record<string, string> = {
  active: '추가됨',
  completed: '완료됨',
  pending: '대기',
  in_progress: '진행중',
}

const EMPTY_LP: LPInput = {
  address_book_id: null,
  name: '',
  type: DEFAULT_LP_TYPE,
  commitment: null,
  paid_in: null,
  contact: '',
}

function buildNoticeDraft(fund: Fund | undefined): EditableNoticePeriod[] {
  const existing = fund?.notice_periods ?? []
  if (existing.length > 0) {
    return existing.map((row) => ({
      _row_id: `notice-${row.id}`,
      notice_type: row.notice_type,
      label: row.label,
      business_days: row.business_days,
      day_basis: row.day_basis ?? 'business',
      memo: row.memo ?? '',
    }))
  }
  return STANDARD_NOTICE_TYPES.map((item, idx) => ({
    _row_id: `notice-new-${idx}`,
    notice_type: item.notice_type,
    label: item.label,
    business_days: item.default_days,
    day_basis: 'business',
    memo: '',
  }))
}

function buildKeyTermDraft(fund: Fund | undefined): EditableKeyTerm[] {
  const existing = fund?.key_terms ?? []
  if (existing.length > 0) {
    return existing.map((row) => ({
      _row_id: `term-${row.id}`,
      category: row.category,
      label: row.label,
      value: row.value,
      article_ref: row.article_ref ?? '',
    }))
  }
  return [{
    _row_id: 'term-new-0',
    category: '기타',
    label: '',
    value: '',
    article_ref: '',
  }]
}

function dueText(doc: DocumentStatusItem): string | null {
  if (doc.days_remaining == null) return null
  if (doc.days_remaining < 0) return `지연 ${Math.abs(doc.days_remaining)}일`
  return `D-${doc.days_remaining}`
}

const WORKFLOW_STATUS_LABEL: Record<string, string> = {
  active: '진행 중',
  completed: '완료',
  cancelled: '취소',
}

const DIST_TYPE_LABEL: Record<string, string> = {
  principal: '원금배분',
  profit: '수익배분',
  in_kind: '잔여자산배분',
  cash: '현금배분',
  원금배분: '원금배분',
  수익배분: '수익배분',
  잔여자산배분: '잔여자산배분',
  현금배분: '현금배분',
}

const ASSEMBLY_TYPE_LABEL: Record<string, string> = {
  founding: '결성총회',
  regular: '정기총회',
  special: '임시총회',
  결성총회: '결성총회',
  정기총회: '정기총회',
  임시총회: '임시총회',
}

const LP_TRANSFER_STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소',
}

const DIST_TYPE_OPTIONS = ['cash', 'principal', 'profit', 'in_kind']
const ASSEMBLY_TYPE_OPTIONS = ['founding', 'regular', 'special']
const ASSEMBLY_STATUS_OPTIONS = ['planned', 'scheduled', 'deliberating', 'approved', 'rejected', 'completed']

function buildLinkedWorkflowLabel(call: CapitalCall, fallbackFundName: string): string {
  const name = call.linked_workflow_name?.trim()
  if (name) return name
  return `[${fallbackFundName}] 출자요청 워크플로 진행건`
}

function buildTransferWorkflowLabel(transfer: LPTransfer, fundName: string): string {
  const fromName = transfer.from_lp_name || String(transfer.from_lp_id)
  const toName = transfer.to_lp_name || (transfer.to_lp_id ? String(transfer.to_lp_id) : '신규 LP')
  return `[${fundName}] LP 양수양도 (${fromName} → ${toName}) 승인 단계`
}

function labelDistributionType(value: string | null | undefined): string {
  if (!value) return '-'
  return DIST_TYPE_LABEL[value] ?? value
}

function labelAssemblyType(value: string | null | undefined): string {
  if (!value) return '-'
  return ASSEMBLY_TYPE_LABEL[value] ?? value
}

function toDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function formatPercentValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return `${Number(value).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`
}

function feeBasisLabel(value: string | null | undefined): string {
  if (!value) return '-'
  if (value === 'commitment') return '????'
  if (value === 'nav') return '?????'
  if (value === 'invested') return '????'
  if (value === 'split') return '?? ? ?? ??'
  return value
}

function prorationMethodLabel(value: string | null | undefined): string {
  if (!value) return '-'
  if (value === 'equal_quarter') return '????(??/4)'
  if (value === 'actual_365') return '????(Actual/365)'
  if (value === 'actual_366') return '????(Actual/366)'
  if (value === 'actual_actual') return '????(Actual/Actual)'
  return value
}

function scenarioLabel(value: string | null | undefined): string {
  if (value === 'worst') return '???'
  if (value === 'best') return '??'
  return value === 'base' ? '??' : (value || '-')
}

function feePhaseLabel(value: string | null | undefined): string {
  if (value === 'split') return '?? ? ?? ??'
  if (value === 'post_investment') return '???? ?? ?'
  return value === 'investment' ? '???? ?' : (value || '-')
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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

function normalizeCallType(value: string | null | undefined): string {
  return (value || '').toLowerCase().replace(/\s+/g, '')
}

function isInitialCapitalCall(call: CapitalCall, formationDate: string | null | undefined): boolean {
  const callType = normalizeCallType(call.call_type)
  if (callType.includes('initial') || callType.includes('최초') || callType.includes('초기')) {
    return true
  }
  return !!(formationDate && call.call_date && call.call_date === formationDate)
}

function normalizeStatusKey(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, '').toLowerCase()
}

function isFormingStatus(value: string | null | undefined): boolean {
  return FORMING_STATUS_KEYS.has(normalizeStatusKey(value))
}

function normalizeFormationWorkflowKey(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, '').toLowerCase()
}

function extractFormationSlotFromMemo(memo: string | null | undefined): string | null {
  if (!memo) return null
  const matched = memo.match(/formation_slot\s*=\s*([^\s]+)/i)
  if (!matched) return null
  return normalizeFormationWorkflowKey(matched[1])
}

function LPTransferModal({
  fromLp,
  lps,
  loading,
  onSubmit,
  onCancel,
}: {
  fromLp: LP
  lps: LP[]
  loading: boolean
  onSubmit: (data: LPTransferInput) => void
  onCancel: () => void
}) {
  const [useExistingLp, setUseExistingLp] = useState(true)
  const [toLpId, setToLpId] = useState<number | ''>('')
  const [toLpName, setToLpName] = useState('')
  const [toLpType, setToLpType] = useState<string>(DEFAULT_LP_TYPE)
  const [toLpBusinessNumber, setToLpBusinessNumber] = useState('')
  const [toLpAddress, setToLpAddress] = useState('')
  const [toLpContact, setToLpContact] = useState('')
  const [transferAmount, setTransferAmount] = useState<number>(0)
  const [transferDate, setTransferDate] = useState(todayIso())
  const [notes, setNotes] = useState('')

  const submit = () => {
    if (transferAmount <= 0) return
    if (useExistingLp) {
      if (!toLpId || toLpId === fromLp.id) return
      onSubmit({
        from_lp_id: fromLp.id,
        to_lp_id: toLpId,
        transfer_amount: transferAmount,
        transfer_date: transferDate || null,
        notes: notes.trim() || null,
      })
      return
    }

    if (!toLpName.trim() || !toLpType.trim()) return
    onSubmit({
      from_lp_id: fromLp.id,
      to_lp_name: toLpName.trim(),
      to_lp_type: normalizeLpTypeOrFallback(toLpType, DEFAULT_LP_TYPE),
      to_lp_business_number: toLpBusinessNumber.trim() || null,
      to_lp_address: toLpAddress.trim() || null,
      to_lp_contact: toLpContact.trim() || null,
      transfer_amount: transferAmount,
      transfer_date: transferDate || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#0f1f3d]">LP 양수양도</h3>
          <button onClick={onCancel} className="secondary-btn">닫기</button>
        </div>

        <div className="space-y-3">
          <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] p-2 text-sm">
            양도인: <span className="font-medium text-[#0f1f3d]">{fromLp.name}</span>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">양도 금액</label>
              <KrwAmountInput
                value={transferAmount}
                onChange={(next) => setTransferAmount(next ?? 0)}
                placeholder="숫자 입력"
                className="w-full rounded border px-2 py-1.5 text-sm"
                helperClassName="mt-1 text-[10px] text-[#64748b]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">양도일</label>
              <input
                type="date"
                value={transferDate}
                onChange={(event) => setTransferDate(event.target.value)}
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="rounded border border-[#d8e5fb] p-2">
            <div className="mb-2 flex items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1">
                <input type="radio" checked={useExistingLp} onChange={() => setUseExistingLp(true)} />
                기존 LP
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="radio" checked={!useExistingLp} onChange={() => setUseExistingLp(false)} />
                신규 LP
              </label>
            </div>

            {useExistingLp ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748b]">양수 LP</label>
                <select
                  value={toLpId}
                  onChange={(event) => setToLpId(event.target.value ? Number(event.target.value) : '')}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                >
                  <option value="">양수 LP 선택</option>
                  {lps.filter((lp) => lp.id !== fromLp.id).map((lp) => (
                    <option key={lp.id} value={lp.id}>{lp.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">양수 LP명</label>
                  <input
                    value={toLpName}
                    onChange={(event) => setToLpName(event.target.value)}
                    placeholder="예: OO기관"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">양수 LP 유형</label>
                  <select
                    value={toLpType}
                    onChange={(event) => setToLpType(event.target.value)}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  >
                    {LP_TYPE_SELECT_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">사업자등록번호/생년월일</label>
                  <input
                    value={toLpBusinessNumber}
                    onChange={(event) => setToLpBusinessNumber(event.target.value)}
                    placeholder="선택 입력"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">주소</label>
                  <input
                    value={toLpAddress}
                    onChange={(event) => setToLpAddress(event.target.value)}
                    placeholder="선택 입력"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">연락처</label>
                  <input
                    value={toLpContact}
                    onChange={(event) => setToLpContact(event.target.value)}
                    placeholder="선택 입력"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748b]">비고</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="선택 입력"
              className="w-full rounded border px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="secondary-btn">취소</button>
          <button onClick={submit} disabled={loading} className="primary-btn">
            {loading ? '처리 중...' : '양수양도 시작'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FundForm({
  initial,
  gpEntities,
  loading,
  onSubmit,
  onCancel,
}: {
  initial: FundInput
  gpEntities: GPEntity[]
  loading: boolean
  onSubmit: (data: FundInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FundInput>(initial)

  return (
    <div className="card-base space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[#0f1f3d]">조합 수정</h3>
        <button onClick={onCancel} className="text-[#64748b] hover:text-[#64748b]"><X size={18} /></button>
      </div>

      <FundCoreFields form={form} onChange={setForm} gpEntities={gpEntities} />

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            ...form,
            name: form.name.trim(),
            type: form.type.trim(),
            status: form.status || 'active',
            formation_date: form.formation_date || null,
            registration_number: form.registration_number?.trim() || null,
            registration_date: form.registration_date || null,
            gp_entity_id: form.gp_entity_id ?? null,
            investment_period_end: form.investment_period_end || null,
            maturity_date: form.maturity_date || null,
            dissolution_date: form.dissolution_date || null,
            gp: form.gp?.trim() || null,
            fund_manager: form.fund_manager?.trim() || null,
            co_gp: form.co_gp?.trim() || null,
            trustee: form.trustee?.trim() || null,
            contribution_type: form.contribution_type?.trim() || null,
            account_number: form.account_number?.trim() || null,
          })}
          disabled={loading || !form.name.trim()}
          className="primary-btn"
        >
          저장
        </button>
        <button onClick={onCancel} className="secondary-btn">취소</button>
      </div>
    </div>
  )
}

function LPForm({
  initial,
  addressBooks,
  loading,
  onSubmit,
  onCancel,
}: {
  initial: LPInput
  addressBooks: LPAddressBook[]
  loading: boolean
  onSubmit: (data: LPInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<LPInput>(initial)
  const [selectedAddressBookId, setSelectedAddressBookId] = useState(
    initial.address_book_id ? String(initial.address_book_id) : '',
  )

  return (
    <div className="bg-[#f5f9ff] border border-[#d8e5fb] rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">주소록 매핑</label>
          <select
            value={selectedAddressBookId}
            onChange={(e) => {
              const nextId = e.target.value
              setSelectedAddressBookId(nextId)
              if (!nextId) {
                setForm((prev) => ({ ...prev, address_book_id: null }))
                return
              }
              const selected = addressBooks.find((row) => String(row.id) === nextId)
              if (!selected) return
              setForm((prev) => ({
                ...prev,
                address_book_id: selected.id,
                name: selected.name,
                type: normalizeLpTypeOrFallback(selected.type, DEFAULT_LP_TYPE),
                contact: selected.contact || '',
                business_number: selected.business_number || '',
                address: selected.address || '',
              }))
            }}
            className="form-input"
          >
            <option value="">주소록 선택</option>
            {addressBooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name}
                {book.business_number ? ` (${book.business_number})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div><label className="mb-1 block text-xs font-medium text-[#64748b]">LP 이름</label><input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="LP 이름" className="form-input" /></div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">LP 유형</label>
          <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} className="form-input">
            {LP_TYPE_SELECT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">약정액</label>
          <KrwAmountInput
            value={form.commitment ?? null}
            onChange={(next) => setForm((prev) => ({ ...prev, commitment: next }))}
            placeholder="약정액"
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">납입액</label>
          <KrwAmountInput
            value={form.paid_in ?? null}
            onChange={(next) => setForm((prev) => ({ ...prev, paid_in: next }))}
            placeholder="납입액"
            className="form-input"
          />
        </div>
        <div><label className="mb-1 block text-xs font-medium text-[#64748b]">연락처</label><input value={form.contact || ''} onChange={e => setForm(prev => ({ ...prev, contact: e.target.value }))} placeholder="연락처" className="form-input" /></div>
        <div><label className="mb-1 block text-xs font-medium text-[#64748b]">사업자번호/생년월일</label><input value={form.business_number || ''} onChange={e => setForm(prev => ({ ...prev, business_number: e.target.value }))} placeholder="사업자번호/생년월일" className="form-input" /></div>
        <div className="md:col-span-2"><label className="mb-1 block text-xs font-medium text-[#64748b]">주소</label><input value={form.address || ''} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="주소" className="form-input" /></div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            ...form,
            address_book_id: selectedAddressBookId ? Number(selectedAddressBookId) : (form.address_book_id ?? null),
            name: form.name.trim(),
            type: normalizeLpTypeOrFallback(form.type, DEFAULT_LP_TYPE),
            contact: form.contact?.trim() || null,
            business_number: form.business_number?.trim() || null,
            address: form.address?.trim() || null,
          })}
          disabled={loading || !form.name.trim() || !form.type.trim()}
          className="primary-btn"
        >
          저장
        </button>
        <button onClick={onCancel} className="secondary-btn btn-sm">취소</button>
      </div>
    </div>
  )
}

function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let remaining = Math.max(0, days)
  while (remaining > 0) {
    result.setDate(result.getDate() - 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) {
      remaining -= 1
    }
  }
  return result
}

function subtractCalendarDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - Math.max(0, days))
  return result
}

function parseIsoDateAsLocal(value: string): Date {
  const [year, month, day] = value.split('-').map((v) => Number(v))
  return new Date(year, (month || 1) - 1, day || 1)
}

interface LpAmountDraft {
  lp_id: number
  lp_name: string
  commitment: number
  paid_in: number
  remaining: number
  amount: number
}

interface CapitalCallWizardProps {
  fund: Fund
  lps: LP[]
  noticePeriods: FundNoticePeriodInput[]
  initialPaidIn: number
  onClose: () => void
}

function CapitalCallWizard({
  fund,
  lps,
  noticePeriods,
  initialPaidIn,
  onClose,
}: CapitalCallWizardProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [callDate, setCallDate] = useState('')
  const [callType, setCallType] = useState<'initial' | 'additional' | 'regular'>('additional')
  const [requestPercent, setRequestPercent] = useState(0)
  const [lpAmounts, setLpAmounts] = useState<LpAmountDraft[]>([])
  const [submitting, setSubmitting] = useState(false)

  const commitmentTotal = Number(fund.commitment_total ?? 0)
  const existingPaidIn = useMemo(() => initialPaidIn, [initialPaidIn])
  const remainingCommitment = Math.max(0, commitmentTotal - existingPaidIn)
  const remainingPercent = commitmentTotal ? Math.max(0, Math.round((remainingCommitment / commitmentTotal) * 100)) : 0

  const noticeTypeForCall = useMemo(() => {
    if (callType === 'initial') return 'capital_call_initial'
    if (callType === 'additional') return 'capital_call_additional'
    return noticePeriods.some((item) => item.notice_type === 'capital_call_regular')
      ? 'capital_call_regular'
      : 'capital_call_additional'
  }, [callType, noticePeriods])

  const selectedNoticePeriod = useMemo<FundNoticePeriodInput>(() => {
    const row = noticePeriods.find((item) => item.notice_type === noticeTypeForCall)
    if (row) return row
    return {
      notice_type: noticeTypeForCall,
      label: '출자 요청 통지',
      business_days: 10,
      day_basis: 'business',
      memo: null,
    }
  }, [noticePeriods, noticeTypeForCall])

  const hasNoticeRule = useMemo(
    () => noticePeriods.some((item) => item.notice_type === noticeTypeForCall),
    [noticePeriods, noticeTypeForCall],
  )

  const { data: deadlineResult } = useQuery<NoticeDeadlineResult>({
    queryKey: ['noticeDeadline', fund.id, callDate, noticeTypeForCall],
    queryFn: () => calculateDeadline(fund.id, callDate, noticeTypeForCall),
    enabled: !!callDate && hasNoticeRule,
    retry: false,
  })

  const noticeDays = Number(selectedNoticePeriod.business_days ?? 0)
  const noticeDayBasis = selectedNoticePeriod.day_basis ?? 'business'

  const sendDeadline = useMemo(() => {
    if (!callDate) return null
    if (deadlineResult?.deadline) return parseIsoDateAsLocal(deadlineResult.deadline)
    const targetDate = parseIsoDateAsLocal(callDate)
    if (noticeDayBasis === 'calendar') return subtractCalendarDays(targetDate, noticeDays)
    return subtractBusinessDays(targetDate, noticeDays)
  }, [callDate, deadlineResult?.deadline, noticeDayBasis, noticeDays])

  const isBylawViolation = useMemo(() => {
    if (!callDate || !sendDeadline) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today > sendDeadline
  }, [callDate, sendDeadline])

  useEffect(() => {
    setLpAmounts(
      lps.map((lp) => ({
        lp_id: lp.id,
        lp_name: lp.name,
        commitment: Number(lp.commitment ?? 0),
        paid_in: Number(lp.paid_in ?? 0),
        remaining: Math.max(0, Number(lp.commitment ?? 0) - Number(lp.paid_in ?? 0)),
        amount: Math.min(
          Math.max(0, Number(lp.commitment ?? 0) - Number(lp.paid_in ?? 0)),
          Math.round(Number(lp.commitment ?? 0) * (requestPercent / 100)),
        ),
      })),
    )
  }, [lps, requestPercent])

  const totalAmount = useMemo(
    () => lpAmounts.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [lpAmounts],
  )
  const isAnyLpOverLimit = useMemo(
    () => lpAmounts.some((row) => row.amount > row.remaining),
    [lpAmounts],
  )
  const isTotalOverLimit = totalAmount > remainingCommitment

  const canSubmit = requestPercent > 0
    && requestPercent <= remainingPercent
    && !!callDate
    && totalAmount > 0
    && !isAnyLpOverLimit
    && !isTotalOverLimit
    && !isBylawViolation
    && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      setSubmitting(true)
      const payloadItems = lpAmounts
        .filter((row) => Number(row.amount || 0) > 0)
        .map((row) => ({
          lp_id: row.lp_id,
          amount: Math.max(0, Number(row.amount || 0)),
          paid: false,
          paid_date: null,
        }))
      await createCapitalCallBatch({
        fund_id: fund.id,
        call_date: callDate,
        call_type: callType,
        total_amount: totalAmount,
        request_percent: requestPercent,
        memo: `${requestPercent}% 출자 요청`,
        create_workflow: true,
        items: payloadItems,
      })
      invalidateFundRelated(queryClient, fund.id)
      queryClient.invalidateQueries({ queryKey: ['capitalCalls', { fund_id: fund.id }] })
      addToast('success', '출자 요청을 등록했습니다.')
      onClose()
    } catch {
      addToast('error', '출자 요청 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-semibold text-[#0f1f3d]">출자 요청 위저드</h3>
          <button onClick={onClose} className="secondary-btn">닫기</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">납입일</label>
              <input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">출자 유형</label>
              <select value={callType} onChange={(e) => setCallType(e.target.value as 'initial' | 'additional' | 'regular')} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="initial">최초 출자</option>
                <option value="additional">수시 출자</option>
                <option value="regular">정기 출자</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#64748b]">요청 비율 (%)</label>
              <input type="number" min={0} max={remainingPercent} value={requestPercent} onChange={(e) => setRequestPercent(Number(e.target.value || 0))} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
          </div>

          <div className="rounded-lg bg-[#f5f9ff] p-3 text-sm text-[#1a3660]">
            <p>통지 유형: {selectedNoticePeriod.label || noticeTypeForCall}</p>
            <p>통지 기간: {noticeDays}{noticeDayBasis === 'calendar' ? '일' : '영업일'}</p>
            <p>발송 마감: {sendDeadline ? sendDeadline.toLocaleDateString('ko-KR') : '-'}</p>
            {selectedNoticePeriod.memo ? <p className="mt-1 text-xs text-[#0f1f3d]">규약 메모: {selectedNoticePeriod.memo}</p> : null}
            {isBylawViolation ? <p className="mt-1 font-semibold text-red-600">규약 위반: 통지기간을 충족하지 못하는 일정입니다.</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-[#f5f9ff] p-3">
              <p className="text-xs text-[#64748b]">총 약정</p>
              <p className="text-sm font-semibold text-[#0f1f3d]">{formatKRW(commitmentTotal)}</p>
            </div>
            <div className="rounded-lg bg-[#f5f9ff] p-3">
              <p className="text-xs text-[#64748b]">기납입</p>
              <p className="text-sm font-semibold text-[#0f1f3d]">{formatKRW(existingPaidIn)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">잔여 약정</p>
              <p className="text-sm font-semibold text-emerald-700">{formatKRW(remainingCommitment)} ({remainingPercent}%)</p>
            </div>
          </div>

          <div className="max-h-60 overflow-auto rounded border border-[#d8e5fb]">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                <tr>
                  <th className="px-3 py-2 text-left">LP명</th>
                  <th className="px-3 py-2 text-right">약정금액</th>
                  <th className="px-3 py-2 text-right">요청금액</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lpAmounts.map((row, idx) => (
                  <tr key={row.lp_id}>
                    <td className="px-3 py-2">{row.lp_name}</td>
                    <td className="px-3 py-2 text-right">{formatKRW(row.commitment)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-block">
                        <label className="mb-1 block text-[10px] font-medium text-[#64748b]">요청금액</label>
                        <KrwAmountInput
                          value={row.amount}
                          onChange={(next) => {
                            const amount = Math.max(0, next ?? 0)
                            setLpAmounts((prev) => {
                              const copy = [...prev]
                              copy[idx] = { ...copy[idx], amount }
                              return copy
                            })
                          }}
                          className={`w-36 rounded border px-2 py-1 text-right text-sm ${
                            row.amount > row.remaining ? 'border-red-500 bg-red-50' : ''
                          }`}
                          helperClassName="mt-1 text-[10px] text-right text-[#64748b]"
                        />
                        <p className="mt-1 text-[10px] text-[#64748b]">최대 {formatKRW(row.remaining)}</p>
                        {row.amount > row.remaining && (
                          <p className="mt-1 text-[10px] text-red-600">미납액을 초과한 금액입니다.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between border-t px-5 py-4">
          <div>
            <p className="text-sm text-[#64748b]">총 요청금액: <span className="font-semibold text-[#0f1f3d]">{formatKRW(totalAmount)}</span></p>
            {isTotalOverLimit ? <p className="text-xs text-red-600">총 요청금액이 잔여 약정을 초과했습니다.</p> : null}
            {isAnyLpOverLimit ? <p className="text-xs text-red-600">LP별 미납액 한도를 초과한 입력이 있습니다.</p> : null}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="secondary-btn">취소</button>
            <button onClick={handleSubmit} disabled={!canSubmit} className="primary-btn disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? '등록 중...' : '등록'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FundDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const fundId = Number(id)
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [editingFund, setEditingFund] = useState(false)
  const [showCreateLP, setShowCreateLP] = useState(false)
  const [editingLPId, setEditingLPId] = useState<number | null>(null)
  const [expandedLPId, setExpandedLPId] = useState<number | null>(null)
  const [editingNotices, setEditingNotices] = useState(false)
  const [editingKeyTerms, setEditingKeyTerms] = useState(false)
  const [showCapCallWizard, setShowCapCallWizard] = useState(false)
  const [activeTab, setActiveTab] = useState<FundDetailTab>('overview')
  const isOverviewTab = activeTab === 'overview'
  const isCapitalTab = activeTab === 'capital_lp'
  const isInvestmentsTab = activeTab === 'investments'
  const isFinanceTab = activeTab === 'finance'
  const [investmentViewMode, setInvestmentViewMode] = useState<'cards' | 'table'>('cards')
  const [distExpandedId, setDistExpandedId] = useState<number | null>(null)
  const [editingDistId, setEditingDistId] = useState<number | null>(null)
  const [editingDistItemId, setEditingDistItemId] = useState<number | null>(null)
  const [editingAssemblyId, setEditingAssemblyId] = useState<number | null>(null)
  const [transferSourceLp, setTransferSourceLp] = useState<LP | null>(null)
  const [editDistribution, setEditDistribution] = useState<DistributionEditState | null>(null)
  const [editDistributionItem, setEditDistributionItem] = useState<DistributionItemEditState | null>(null)
  const [editAssembly, setEditAssembly] = useState<AssemblyEditState | null>(null)
  const [noticeDraft, setNoticeDraft] = useState<EditableNoticePeriod[]>([])
  const [keyTermDraft, setKeyTermDraft] = useState<EditableKeyTerm[]>([])
  const [formationWorkflowTriggerDate, setFormationWorkflowTriggerDate] = useState('')
  const [formationTemplateModal, setFormationTemplateModal] = useState<{ slotKey: string; slotLabel: string } | null>(null)
  const [selectedFormationTemplateId, setSelectedFormationTemplateId] = useState<number | ''>('')
  const [lpReportYear, setLpReportYear] = useState(new Date().getFullYear())
  const [lpReportQuarter, setLpReportQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1)
  const [meetingPacketType, setMeetingPacketType] = useState<string>('')
  const [includeBylawAmendmentInPacket, setIncludeBylawAmendmentInPacket] = useState(false)
  const [meetingPacketRunId, setMeetingPacketRunId] = useState<number | null>(null)
  const [meetingPacketMeetingDate, setMeetingPacketMeetingDate] = useState(todayIso())
  const [meetingPacketMeetingTime, setMeetingPacketMeetingTime] = useState('10:00')
  const [meetingPacketMeetingMethod, setMeetingPacketMeetingMethod] = useState('서면결의')
  const [meetingPacketLocation, setMeetingPacketLocation] = useState('')
  const [meetingPacketChairName, setMeetingPacketChairName] = useState('')
  const [meetingPacketDocumentNumber, setMeetingPacketDocumentNumber] = useState('')
  const [meetingPacketAgendaItems, setMeetingPacketAgendaItems] = useState<MeetingPacketAgendaItemInput[]>([])
  const [meetingPacketExternalBindings, setMeetingPacketExternalBindings] = useState<Record<string, number | ''>>({})
  const [meetingPacketDraft, setMeetingPacketDraft] = useState<MeetingPacketDraftResponse | null>(null)
  const [newDistribution, setNewDistribution] = useState<DistributionInput>({
    fund_id: 0,
    dist_date: todayIso(),
    dist_type: 'cash',
    principal_total: 0,
    profit_total: 0,
    performance_fee: 0,
    memo: '',
  })
  const [newDistributionItem, setNewDistributionItem] = useState<DistributionItemInput>({
    lp_id: 0,
    principal: 0,
    profit: 0,
  })
  const [newAssembly, setNewAssembly] = useState<AssemblyInput>({
    fund_id: 0,
    type: 'regular',
    date: todayIso(),
    agenda: '',
    status: 'planned',
    minutes_completed: false,
    memo: '',
  })

  const { data: fundDetail, isLoading } = useQuery<Fund>({
    queryKey: ['fund', fundId],
    queryFn: () => fetchFund(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({
    queryKey: ['gpEntities'],
    queryFn: fetchGPEntities,
  })
  const isFormingFund = useMemo(
    () => isFormingStatus(fundDetail?.status),
    [fundDetail?.status],
  )
  const linkedGpEntity = useMemo(
    () => gpEntities.find((entity) => entity.id === (fundDetail?.gp_entity_id ?? null)) ?? null,
    [fundDetail?.gp_entity_id, gpEntities],
  )

  const { data: fundWorkflowInstances = [] } = useQuery<WorkflowInstance[]>({
    queryKey: ['workflowInstances', { status: 'all', fund_id: fundId }],
    queryFn: () => fetchWorkflowInstances({ status: 'all', fund_id: fundId }),
    enabled: Number.isFinite(fundId) && fundId > 0 && isFormingFund,
  })

  const { data: workflowTemplates = [] } = useQuery<WorkflowListItem[]>({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
    enabled: isFormingFund,
  })

  const { data: investments } = useQuery<FundInvestmentListItem[]>({
    queryKey: ['investments', { fund_id: fundId }],
    queryFn: () => fetchInvestments({ fund_id: fundId }),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: fundValuations = [] } = useQuery<Valuation[]>({
    queryKey: ['valuations', { fund_id: fundId }],
    queryFn: () => fetchValuations({ fund_id: fundId }),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: fundManagementFees = [] } = useQuery<ManagementFeeResponse[]>({
    queryKey: ['fees', 'management', fundId],
    queryFn: () => fetchManagementFeesByFund(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: fundFeeConfig } = useQuery<FeeConfigResponse>({
    queryKey: ['fees', 'config', fundId],
    queryFn: () => fetchFeeConfig(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: fundPerformanceFees = [] } = useQuery<PerformanceFeeSimulationResponse[]>({
    queryKey: ['fees', 'performance', fundId],
    queryFn: () => fetchPerformanceFeeSimulations(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: fundWaterfall } = useQuery<WaterfallResponse>({
    queryKey: ['fees', 'waterfall', fundId],
    queryFn: () => fetchFeeWaterfall(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0 && fundPerformanceFees.length > 0,
    retry: false,
  })

  const { data: missingDocs } = useQuery<DocumentStatusItem[]>({
    queryKey: ['documentStatus', { fund_id: fundId, status: 'pending' }],
    queryFn: () => fetchDocumentStatus({ fund_id: fundId, status: 'pending' }),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })
  const { data: pendingTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', { fund_id: fundId, status: 'pending-and-progress' }],
    queryFn: async () => {
      const [pending, inProgress] = await Promise.all([
        fetchTasks({ fund_id: fundId, status: 'pending' }),
        fetchTasks({ fund_id: fundId, status: 'in_progress' }),
      ])
      const merged = [...pending, ...inProgress]
      const byId = new Map(merged.map((row) => [row.id, row]))
      return Array.from(byId.values())
    },
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: capitalCalls = [] } = useQuery<CapitalCall[]>({
    queryKey: ['capitalCalls', { fund_id: fundId }],
    queryFn: () => fetchCapitalCalls({ fund_id: fundId }),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })
  const { data: capitalCallSummary } = useQuery<CapitalCallSummary>({
    queryKey: ['capitalCallSummary', fundId],
    queryFn: () => fetchCapitalCallSummary(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: lpAddressBooks = [] } = useQuery<LPAddressBook[]>({
    queryKey: ['lpAddressBooks', { is_active: 1 }],
    queryFn: () => fetchLPAddressBooks({ is_active: 1 }),
  })

  const { data: lpTransfers = [] } = useQuery<LPTransfer[]>({
    queryKey: ['lpTransfers', fundId],
    queryFn: () => fetchLPTransfers(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: distributions = [] } = useQuery<Distribution[]>({
    queryKey: ['distributions', fundId],
    queryFn: () => fetchDistributions({ fund_id: fundId }),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })

  const { data: distributionItems = [] } = useQuery<DistributionItem[]>({
    queryKey: ['distributionItems', distExpandedId],
    queryFn: () => fetchDistributionItems(distExpandedId as number),
    enabled: !!distExpandedId,
  })

  const { data: assemblies = [] } = useQuery<Assembly[]>({
    queryKey: ['assemblies', fundId],
    queryFn: () => fetchAssemblies({ fund_id: fundId }),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })
  const { data: lpReportPreview } = useQuery<Record<string, any>>({
    queryKey: ['lpReportPreview', fundId, lpReportYear, lpReportQuarter],
    queryFn: () => previewLPReportData(fundId, { year: lpReportYear, quarter: lpReportQuarter }),
    enabled: Number.isFinite(fundId) && fundId > 0 && activeTab === 'documents',
  })
  const { data: meetingPacketPlan } = useQuery<MeetingPacketGenerationPlanResponse>({
    queryKey: [
      'meetingPacketPlan',
      fundId,
      meetingPacketType,
      includeBylawAmendmentInPacket,
    ],
    queryFn: () =>
      fetchFundMeetingPacketPlan(fundId, {
        packet_type: meetingPacketType || undefined,
        report_year: lpReportYear,
        include_bylaw_amendment: includeBylawAmendmentInPacket,
    }),
    enabled: Number.isFinite(fundId) && fundId > 0 && activeTab === 'documents',
  })
  const { data: meetingPacketDraftQuery } = useQuery<MeetingPacketDraftResponse>({
    queryKey: ['meetingPacketDraft', meetingPacketRunId],
    queryFn: () => fetchMeetingPacket(meetingPacketRunId as number),
    enabled: !!meetingPacketRunId && activeTab === 'documents',
  })
  const { data: fundLegalDocuments = [] } = useQuery<LegalDocument[]>({
    queryKey: ['fundLegalDocuments', fundId],
    queryFn: () => fetchLegalDocuments({ fund_id: fundId, active_only: true }),
    enabled: Number.isFinite(fundId) && fundId > 0 && activeTab === 'documents',
  })

  const prepareMeetingPacketMut = useMutation({
    mutationFn: (payload: {
      fund_id: number
      packet_type: MeetingPacketDraftResponse['packet_type']
      meeting_date: string
      meeting_time?: string | null
      meeting_method?: string | null
      location?: string | null
      chair_name?: string | null
      document_number?: string | null
      report_year?: number | null
      include_bylaw_amendment?: boolean
    }) => prepareMeetingPacket(fundId, payload),
    onSuccess: (result) => {
      setMeetingPacketRunId(result.run_id)
      setMeetingPacketDraft(result)
      queryClient.setQueryData(['meetingPacketDraft', result.run_id], result)
      addToast('success', '총회 패키지 초안을 준비했습니다.')
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '총회 패키지 준비에 실패했습니다.'),
  })

  const saveMeetingPacketMut = useMutation({
    mutationFn: (payload: { runId: number; data: Parameters<typeof updateMeetingPacket>[1] }) =>
      updateMeetingPacket(payload.runId, payload.data),
    onSuccess: (result) => {
      setMeetingPacketDraft(result)
      queryClient.setQueryData(['meetingPacketDraft', result.run_id], result)
      addToast('success', '총회 패키지 초안을 저장했습니다.')
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '총회 패키지 저장에 실패했습니다.'),
  })

  const generateMeetingPacketMut = useMutation({
    mutationFn: (runId: number) => generateMeetingPacket(runId),
    onSuccess: (result) => {
      setMeetingPacketDraft((prev) =>
        prev && prev.run_id === result.run_id
          ? {
              ...prev,
              status: result.status,
              documents: result.documents,
              zip_attachment_id: result.zip_attachment_id,
              zip_download_url: result.zip_download_url,
            }
          : prev,
      )
      addToast('success', result.missing_slots.length ? '문서 생성 후 부분 패키지를 만들었습니다.' : '문서 생성과 패키징을 완료했습니다.')
      if (meetingPacketRunId) {
        queryClient.invalidateQueries({ queryKey: ['meetingPacketDraft', meetingPacketRunId] })
      }
    },
    onError: (error) => addToast('error', error instanceof Error ? error.message : '총회 패키지 생성에 실패했습니다.'),
  })

  useEffect(() => {
    if (!fundDetail) return
    if (!editingNotices) {
      setNoticeDraft(buildNoticeDraft(fundDetail))
    }
    if (!editingKeyTerms) {
      setKeyTermDraft(buildKeyTermDraft(fundDetail))
    }
    if (!meetingPacketLocation) {
      setMeetingPacketLocation(fundDetail.gp || fundDetail.name || '')
    }
    if (!meetingPacketChairName) {
      setMeetingPacketChairName(fundDetail.gp || fundDetail.fund_manager || '')
    }
  }, [fundDetail, editingNotices, editingKeyTerms])

  useEffect(() => {
    if (!meetingPacketDraftQuery) return
    setMeetingPacketDraft(meetingPacketDraftQuery)
    setMeetingPacketMeetingDate(meetingPacketDraftQuery.meeting_date || todayIso())
    setMeetingPacketMeetingTime(meetingPacketDraftQuery.meeting_time || '10:00')
    setMeetingPacketMeetingMethod(meetingPacketDraftQuery.meeting_method || '서면결의')
    setMeetingPacketLocation(meetingPacketDraftQuery.location || '')
    setMeetingPacketChairName(meetingPacketDraftQuery.chair_name || '')
    setMeetingPacketDocumentNumber(meetingPacketDraftQuery.document_number || '')
    setMeetingPacketAgendaItems(meetingPacketDraftQuery.agenda_items || [])
    setMeetingPacketExternalBindings(
      Object.fromEntries(
        (meetingPacketDraftQuery.documents || [])
          .filter((item) => item.external_document_id != null)
          .map((item) => [item.slot, item.external_document_id as number]),
      ),
    )
  }, [meetingPacketDraftQuery])

  useEffect(() => {
    setMeetingPacketRunId(null)
    setMeetingPacketDraft(null)
    setMeetingPacketAgendaItems([])
    setMeetingPacketExternalBindings({})
    setMeetingPacketDocumentNumber('')
  }, [fundId])

  const activeMeetingPacketDraft = meetingPacketDraft ?? meetingPacketDraftQuery ?? null
  const meetingPacketExternalSlots = activeMeetingPacketDraft?.slots.filter((slot) => slot.generation_mode === 'external_receive') ?? []

  const prepareMeetingPacketDraft = async () => {
    const packetType = (meetingPacketType || meetingPacketPlan?.recommended_packet_type || 'fund_lp_regular_meeting_project') as MeetingPacketDraftResponse['packet_type']
    const result = await prepareMeetingPacketMut.mutateAsync({
      fund_id: fundId,
      packet_type: packetType,
      meeting_date: meetingPacketMeetingDate,
      meeting_time: meetingPacketMeetingTime,
      meeting_method: meetingPacketMeetingMethod,
      location: meetingPacketLocation || null,
      chair_name: meetingPacketChairName || null,
      document_number: meetingPacketDocumentNumber || null,
      report_year: lpReportYear,
      include_bylaw_amendment: includeBylawAmendmentInPacket,
    })
    setMeetingPacketAgendaItems(result.agenda_items || [])
    return result
  }

  const saveMeetingPacketDraft = async (runId: number) => {
    const external_bindings = Object.entries(meetingPacketExternalBindings).map(([slot, external_document_id]) => ({
      slot,
      external_document_id: external_document_id === '' ? null : Number(external_document_id),
    }))
    return saveMeetingPacketMut.mutateAsync({
      runId,
      data: {
        meeting_date: meetingPacketMeetingDate,
        meeting_time: meetingPacketMeetingTime,
        meeting_method: meetingPacketMeetingMethod,
        location: meetingPacketLocation || null,
        chair_name: meetingPacketChairName || null,
        document_number: meetingPacketDocumentNumber || null,
        report_year: lpReportYear,
        include_bylaw_amendment: includeBylawAmendmentInPacket,
        agenda_items: meetingPacketAgendaItems.map((item, index) => ({
          ...item,
          sort_order: index,
        })),
        external_bindings,
      },
    })
  }

  const runMeetingPacketGeneration = async () => {
    const draft = activeMeetingPacketDraft ?? (await prepareMeetingPacketDraft())
    const saved = await saveMeetingPacketDraft(draft.run_id)
    setMeetingPacketRunId(saved.run_id)
    setMeetingPacketDraft(saved)
    await generateMeetingPacketMut.mutateAsync(saved.run_id)
  }

  const updateMeetingAgendaItem = (index: number, patch: Partial<MeetingPacketAgendaItemInput>) => {
    setMeetingPacketAgendaItems((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    )
  }

  const addMeetingAgendaItem = () => {
    setMeetingPacketAgendaItems((prev) => [
      ...prev,
      {
        sort_order: prev.length,
        kind: 'custom',
        title: '',
        short_title: '',
        description: '',
        requires_vote: true,
      },
    ])
  }

  const removeMeetingAgendaItem = (index: number) => {
    setMeetingPacketAgendaItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  useEffect(() => {
    setFormationWorkflowTriggerDate('')
    setFormationTemplateModal(null)
    setSelectedFormationTemplateId('')
    setActiveTab('overview')
    setDistExpandedId(null)
    setEditingDistId(null)
    setEditingDistItemId(null)
    setEditingAssemblyId(null)
    setExpandedLPId(null)
    setEditDistribution(null)
    setEditDistributionItem(null)
    setEditAssembly(null)
    setTransferSourceLp(null)
    setNewDistribution({
      fund_id: 0,
      dist_date: todayIso(),
      dist_type: 'cash',
      principal_total: 0,
      profit_total: 0,
      performance_fee: 0,
      memo: '',
    })
    setNewDistributionItem({ lp_id: 0, principal: 0, profit: 0 })
    setNewAssembly({
      fund_id: 0,
      type: 'regular',
      date: todayIso(),
      agenda: '',
      status: 'planned',
      minutes_completed: false,
      memo: '',
    })
  }, [fundId])

  useEffect(() => {
    if (!isFormingFund || formationWorkflowTriggerDate) return
    setFormationWorkflowTriggerDate(
      fundDetail?.formation_date || new Date().toISOString().slice(0, 10),
    )
  }, [fundDetail?.formation_date, formationWorkflowTriggerDate, isFormingFund])

  const totalInvestmentAmount = useMemo(
    () => (investments ?? []).reduce((sum, inv) => sum + (inv.amount ?? 0), 0),
    [investments],
  )

  const navSeries = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const row of fundValuations) {
      const dateKey = row.valuation_date || row.as_of_date
      if (!dateKey) continue
      const navValue = Number(row.total_fair_value ?? row.value ?? 0)
      grouped.set(dateKey, (grouped.get(dateKey) || 0) + navValue)
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, nav]) => ({ date, nav }))
  }, [fundValuations])

  const navSparklinePath = useMemo(() => {
    if (navSeries.length < 2) return ''
    const width = 100
    const height = 36
    const min = Math.min(...navSeries.map((row) => row.nav))
    const max = Math.max(...navSeries.map((row) => row.nav))
    const range = Math.max(1, max - min)
    return navSeries
      .map((row, index) => {
        const x = (index / (navSeries.length - 1)) * width
        const y = height - ((row.nav - min) / range) * height
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }, [navSeries])

  const latestNav = navSeries.length > 0 ? navSeries[navSeries.length - 1].nav : 0
  const feeTotalAmount = useMemo(
    () => fundManagementFees.reduce((sum, row) => sum + Number(row.fee_amount || 0), 0),
    [fundManagementFees],
  )
  const feePendingCount = useMemo(
    () => fundManagementFees.filter((row) => row.status !== '수령').length,
    [fundManagementFees],
  )

  const latestPerformanceFee = fundPerformanceFees[0] ?? null
  const effectiveMgmtFeeRate = fundFeeConfig?.mgmt_fee_rate != null
    ? Number(fundFeeConfig.mgmt_fee_rate) * 100
    : fundDetail?.mgmt_fee_rate ?? null
  const effectivePerformanceFeeRate = fundFeeConfig?.carry_rate != null
    ? Number(fundFeeConfig.carry_rate) * 100
    : fundDetail?.performance_fee_rate ?? null
  const effectiveHurdleRate = fundFeeConfig?.hurdle_rate != null
    ? Number(fundFeeConfig.hurdle_rate) * 100
    : fundDetail?.hurdle_rate ?? null

  const sortedCapitalCalls = useMemo(
    () => [...capitalCalls].sort((a, b) => (a.call_date || '').localeCompare(b.call_date || '')),
    [capitalCalls],
  )

  const callPaidAmountById = useMemo(() => {
    const map = new Map<number, number>()
    for (const row of capitalCallSummary?.calls ?? []) {
      map.set(row.id, Number(row.paid_amount ?? 0))
    }
    return map
  }, [capitalCallSummary?.calls])

  const lpPaidInTotal = useMemo(
    () => (fundDetail?.lps ?? []).reduce((sum, lp) => sum + Number(lp.paid_in ?? 0), 0),
    [fundDetail?.lps],
  )
  const lpCommitmentTotal = useMemo(
    () => (fundDetail?.lps ?? []).reduce((sum, lp) => sum + Number(lp.commitment ?? 0), 0),
    [fundDetail?.lps],
  )
  const capitalCommitmentBase = useMemo(() => {
    const declaredCommitment = Number(fundDetail?.commitment_total ?? 0)
    return declaredCommitment > 0 ? declaredCommitment : lpCommitmentTotal
  }, [fundDetail?.commitment_total, lpCommitmentTotal])
  const capitalGridRows = useMemo(
    () =>
      (fundDetail?.lps ?? []).map((lp) => {
        const commitment = Number(lp.commitment ?? 0)
        const paidIn = Number(lp.paid_in ?? 0)
        const shareRatio = capitalCommitmentBase > 0 ? (commitment / capitalCommitmentBase) * 100 : 0
        const note = groupLpType(lp.type)
        return {
          ...lp,
          commitment,
          paidIn,
          shareRatio,
          note,
        }
      }),
    [capitalCommitmentBase, fundDetail?.lps],
  )

  const splitCapitalCalls = useMemo(() => {
    const initial: CapitalCall[] = []
    const nonInitial: CapitalCall[] = []
    for (const call of sortedCapitalCalls) {
      if (isInitialCapitalCall(call, fundDetail?.formation_date)) {
        initial.push(call)
      } else {
        nonInitial.push(call)
      }
    }
    return { initial, nonInitial }
  }, [fundDetail?.formation_date, sortedCapitalCalls])

  const initialCallsPaidTotal = useMemo(
    () =>
      splitCapitalCalls.initial.reduce(
        (sum, call) => sum + Number(callPaidAmountById.get(call.id) ?? Number(call.total_amount || 0)),
        0,
      ),
    [callPaidAmountById, splitCapitalCalls.initial],
  )

  const nonInitialCallsPaidTotal = useMemo(
    () =>
      splitCapitalCalls.nonInitial.reduce(
        (sum, call) => sum + Number(callPaidAmountById.get(call.id) ?? Number(call.total_amount || 0)),
        0,
      ),
    [callPaidAmountById, splitCapitalCalls.nonInitial],
  )

  const paidByCallsTotal = useMemo(
    () => initialCallsPaidTotal + nonInitialCallsPaidTotal,
    [initialCallsPaidTotal, nonInitialCallsPaidTotal],
  )

  const initialPaidIn = useMemo(
    () => Math.max(Math.max(0, lpPaidInTotal - nonInitialCallsPaidTotal), initialCallsPaidTotal),
    [initialCallsPaidTotal, lpPaidInTotal, nonInitialCallsPaidTotal],
  )

  const initialPaidInForWizard = useMemo(
    () => Math.max(lpPaidInTotal, paidByCallsTotal),
    [lpPaidInTotal, paidByCallsTotal],
  )

  const historyTotalPaidIn = useMemo(
    () => initialPaidIn + nonInitialCallsPaidTotal,
    [initialPaidIn, nonInitialCallsPaidTotal],
  )

  const keyTermsByCategory = useMemo(() => {
    const grouped = new Map<string, { label: string; value: string; article_ref: string | null }[]>()
    for (const term of fundDetail?.key_terms ?? []) {
      const category = term.category || '기타'
      const list = grouped.get(category) ?? []
      list.push({ label: term.label, value: term.value, article_ref: term.article_ref })
      grouped.set(category, list)
    }
    return Array.from(grouped.entries())
  }, [fundDetail?.key_terms])

  const formationWorkflowStateMap = useMemo(() => {
    const workflowNameMap = new Map(
      FORMATION_WORKFLOW_BUTTONS.map((button) => [normalizeFormationWorkflowKey(button.key), button.key]),
    )
    const slotMap = new Map(
      FORMATION_WORKFLOW_BUTTONS.map((button) => [normalizeFormationWorkflowKey(button.key), button.key]),
    )
    const stateMap = new Map<string, WorkflowInstance>()

    for (const instance of fundWorkflowInstances) {
      const statusKey = (instance.status || '').trim().toLowerCase()
      if (statusKey === 'cancelled') {
        continue
      }
      const slotToken = extractFormationSlotFromMemo(instance.memo)
      const targetKey =
        (slotToken ? slotMap.get(slotToken) : undefined) ||
        workflowNameMap.get(normalizeFormationWorkflowKey(instance.workflow_name))
      if (!targetKey || stateMap.has(targetKey)) {
        continue
      }
      stateMap.set(targetKey, instance)
    }

    return stateMap
  }, [fundWorkflowInstances])

  const workflowTemplateOptions = useMemo(
    () =>
      [...workflowTemplates].sort((a, b) => {
        const categoryA = (a.category || '').trim()
        const categoryB = (b.category || '').trim()
        if (categoryA !== categoryB) return categoryA.localeCompare(categoryB, 'ko')
        return a.name.localeCompare(b.name, 'ko')
      }),
    [workflowTemplates],
  )

  const invalidateFundLinked = () => {
    invalidateFundRelated(queryClient, fundId)
  }

  const generateLpReportMut = useMutation({
    mutationFn: () => generateLPReport(fundId, { year: lpReportYear, quarter: lpReportQuarter }),
    onSuccess: (result) => {
      addToast('success', result.message || 'LP 보고서 초안을 생성했습니다.')
      if (result.download_url) {
        window.open(result.download_url, '_blank', 'noopener,noreferrer')
      }
    },
    onError: () => {
      addToast('warning', 'LP 보고서 생성에 실패했습니다.')
    },
  })

  const updateFundMut = useMutation({
    mutationFn: ({ id: targetId, data }: { id: number; data: Partial<FundInput> }) => updateFund(targetId, data),
    onSuccess: () => {
      invalidateFundLinked()
      setEditingFund(false)
      addToast('success', '조합이 수정되었습니다.')
    },
  })

  const saveNoticeMut = useMutation({
    mutationFn: (rows: EditableNoticePeriod[]) => {
      const payload: FundNoticePeriodInput[] = rows
        .filter((row) => row.notice_type.trim() && row.label.trim())
        .map((row) => ({
          notice_type: row.notice_type.trim(),
          label: row.label.trim(),
          business_days: Math.max(0, Number(row.business_days) || 0),
          day_basis: row.day_basis === 'calendar' ? 'calendar' : 'business',
          memo: row.memo?.trim() || null,
        }))
      return updateFundNoticePeriods(fundId, payload)
    },
    onSuccess: () => {
      invalidateFundLinked()
      setEditingNotices(false)
      addToast('success', '통지기간이 저장되었습니다.')
    },
  })

  const saveKeyTermsMut = useMutation({
    mutationFn: (rows: EditableKeyTerm[]) => {
      const payload: FundKeyTermInput[] = rows
        .filter((row) => row.label.trim() && row.value.trim())
        .map((row) => ({
          category: row.category.trim() || '기타',
          label: row.label.trim(),
          value: row.value.trim(),
          article_ref: row.article_ref?.trim() || null,
        }))
      return updateFundKeyTerms(fundId, payload)
    },
    onSuccess: () => {
      invalidateFundLinked()
      setEditingKeyTerms(false)
      addToast('success', '주요 계약 조항이 저장되었습니다.')
    },
  })

  const deleteFundMut = useMutation({
    mutationFn: deleteFund,
    onSuccess: () => {
      invalidateFundLinked()
      addToast('success', '조합이 삭제되었습니다.')
      navigate('/funds')
    },
  })

  const createLPMut = useMutation({
    mutationFn: ({ data }: { data: LPInput }) => createFundLP(fundId, data),
    onSuccess: () => {
      invalidateFundLinked()
      setShowCreateLP(false)
      addToast('success', 'LP가 추가되었습니다.')
    },
  })

  const updateLPMut = useMutation({
    mutationFn: ({ lpId, data }: { lpId: number; data: Partial<LPInput> }) => updateFundLP(fundId, lpId, data),
    onSuccess: () => {
      invalidateFundLinked()
      setEditingLPId(null)
      addToast('success', 'LP가 수정되었습니다.')
    },
  })

  const deleteLPMut = useMutation({
    mutationFn: (lpId: number) => deleteFundLP(fundId, lpId),
    onSuccess: () => {
      invalidateFundLinked()
      addToast('success', 'LP가 삭제되었습니다.')
    },
  })
  const generateContributionCertMut = useMutation({
    mutationFn: async ({ lpId }: { lpId: number }) => {
      const generated = await generateDocumentByBuilder({
        builder: 'contribution_cert',
        params: { fund_id: fundId, lp_id: lpId },
      })
      const blob = await downloadGeneratedDocument(generated.document_id)
      return { generated, blob }
    },
    onSuccess: ({ generated, blob }) => {
      downloadBlob(blob, generated.filename)
      queryClient.invalidateQueries({ queryKey: ['generatedDocuments'] })
      addToast('success', '출자증서를 생성했습니다.')
    },
  })

  const createLPTransferMut = useMutation({
    mutationFn: (data: LPTransferInput) => createLPTransfer(fundId, data),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['lpTransfers', fundId] })
      setTransferSourceLp(null)
      addToast('success', 'LP 양수양도 워크플로우를 시작했습니다.')
    },
  })

  const completeLPTransferMut = useMutation({
    mutationFn: (transferId: number) => completeLPTransfer(fundId, transferId),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['lpTransfers', fundId] })
      addToast('success', 'LP 양수양도를 완료 처리했습니다.')
    },
  })

  const cancelLPTransferMut = useMutation({
    mutationFn: (transferId: number) => updateLPTransfer(fundId, transferId, { status: 'cancelled' }),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['lpTransfers', fundId] })
      addToast('success', 'LP 양수양도를 취소 처리했습니다.')
    },
  })

  const createDistMut = useMutation({
    mutationFn: (data: DistributionInput) => createDistribution(data),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['distributions', fundId] })
      addToast('success', '배분을 등록했습니다.')
    },
  })

  const updateDistMut = useMutation({
    mutationFn: ({ distId, data }: { distId: number; data: Partial<DistributionInput> }) =>
      updateDistribution(distId, data),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['distributions', fundId] })
      setEditingDistId(null)
      setEditDistribution(null)
      addToast('success', '배분을 수정했습니다.')
    },
  })

  const deleteDistMut = useMutation({
    mutationFn: (distId: number) => deleteDistribution(distId),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['distributions', fundId] })
      addToast('success', '배분을 삭제했습니다.')
    },
  })

  const createDistItemMut = useMutation({
    mutationFn: ({ distributionId, data }: { distributionId: number; data: DistributionItemInput }) =>
      createDistributionItem(distributionId, data),
    onSuccess: (_data, variables) => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['distributionItems', variables.distributionId] })
      queryClient.invalidateQueries({ queryKey: ['distributions', fundId] })
      addToast('success', 'LP 배분 항목을 추가했습니다.')
    },
  })

  const updateDistItemMut = useMutation({
    mutationFn: ({
      distributionId,
      itemId,
      data,
    }: {
      distributionId: number
      itemId: number
      data: Partial<DistributionItemInput>
    }) => updateDistributionItem(distributionId, itemId, data),
    onSuccess: (_data, variables) => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['distributionItems', variables.distributionId] })
      queryClient.invalidateQueries({ queryKey: ['distributions', fundId] })
      setEditingDistItemId(null)
      setEditDistributionItem(null)
      addToast('success', 'LP 배분 항목을 수정했습니다.')
    },
  })

  const deleteDistItemMut = useMutation({
    mutationFn: ({ distributionId, itemId }: { distributionId: number; itemId: number }) =>
      deleteDistributionItem(distributionId, itemId),
    onSuccess: (_data, variables) => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['distributionItems', variables.distributionId] })
      queryClient.invalidateQueries({ queryKey: ['distributions', fundId] })
      addToast('success', 'LP 배분 항목을 삭제했습니다.')
    },
  })

  const createAssemblyMut = useMutation({
    mutationFn: (data: AssemblyInput) => createAssembly(data),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['assemblies', fundId] })
      addToast('success', '총회를 등록했습니다.')
    },
  })

  const updateAssemblyMut = useMutation({
    mutationFn: ({ assemblyId, data }: { assemblyId: number; data: Partial<AssemblyInput> }) =>
      updateAssembly(assemblyId, data),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['assemblies', fundId] })
      setEditingAssemblyId(null)
      setEditAssembly(null)
      addToast('success', '총회를 수정했습니다.')
    },
  })

  const deleteAssemblyMut = useMutation({
    mutationFn: (assemblyId: number) => deleteAssembly(assemblyId),
    onSuccess: () => {
      invalidateFundLinked()
      queryClient.invalidateQueries({ queryKey: ['assemblies', fundId] })
      addToast('success', '총회를 삭제했습니다.')
    },
  })

  const addFormationWorkflowMut = useMutation({
    mutationFn: ({
      templateName,
      triggerDate,
      templateId,
    }: {
      templateName: string
      triggerDate: string
      templateId: number
    }) =>
      addFundFormationWorkflow(fundId, {
        template_category_or_name: templateName,
        template_id: templateId,
        trigger_date: triggerDate,
      }),
    onSuccess: (data) => {
      invalidateFundLinked()
      setFormationTemplateModal(null)
      setSelectedFormationTemplateId('')
      addToast('success', `${data.workflow_name} 워크플로를 추가했습니다.`)
    },
    onError: (error: unknown) => {
      const detail =
        typeof error === 'object' && error && 'response' in error
          ? (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : undefined
      addToast(
        'error',
        typeof detail === 'string' && detail.trim()
          ? detail
          : '결성 워크플로 추가에 실패했습니다.',
      )
    },
  })

  const openFormationTemplateModal = (slotKey: string, slotLabel: string) => {
    const recommended = workflowTemplateOptions.find(
      (template) => normalizeFormationWorkflowKey(template.name) === normalizeFormationWorkflowKey(slotKey),
    )
    setSelectedFormationTemplateId(recommended?.id || '')
    setFormationTemplateModal({ slotKey, slotLabel })
  }

  const handleAddFormationWorkflow = () => {
    if (!formationTemplateModal) return
    if (!formationWorkflowTriggerDate) {
      addToast('error', '기준일을 먼저 입력해주세요.')
      return
    }
    if (!selectedFormationTemplateId) {
      addToast('error', '템플릿을 선택해주세요.')
      return
    }
    if (
      !confirm(
        `"${formationTemplateModal.slotLabel}" 워크플로를 기준일(${formationWorkflowTriggerDate})로 생성하시겠습니까?`,
      )
    ) {
      return
    }
    addFormationWorkflowMut.mutate({
      templateName: formationTemplateModal.slotKey,
      triggerDate: formationWorkflowTriggerDate,
      templateId: Number(selectedFormationTemplateId),
    })
  }

  const toggleDistributionEdit = (row: Distribution) => {
    if (editingDistId === row.id) {
      setEditingDistId(null)
      setEditDistribution(null)
      return
    }
    setEditingDistId(row.id)
    setEditDistribution({
      dist_date: row.dist_date,
      dist_type: row.dist_type,
      principal_total: row.principal_total,
      profit_total: row.profit_total,
      performance_fee: row.performance_fee,
      memo: row.memo || '',
    })
  }

  const toggleDistributionItemEdit = (item: DistributionItem) => {
    if (editingDistItemId === item.id) {
      setEditingDistItemId(null)
      setEditDistributionItem(null)
      return
    }
    setEditingDistItemId(item.id)
    setEditDistributionItem({
      principal: item.principal,
      profit: item.profit,
    })
  }

  const toggleAssemblyEdit = (row: Assembly) => {
    if (editingAssemblyId === row.id) {
      setEditingAssemblyId(null)
      setEditAssembly(null)
      return
    }
    setEditingAssemblyId(row.id)
    setEditAssembly({
      date: row.date,
      type: row.type,
      status: row.status,
      agenda: row.agenda || '',
      minutes_completed: row.minutes_completed,
      memo: row.memo || '',
    })
  }

  if (!Number.isFinite(fundId) || fundId <= 0) {
    return <div className="page-container text-sm text-red-600">유효하지 않은 조합 ID입니다.</div>
  }

  const fundDetailMetrics: Array<{
    label: string
    value: string
    hint: string
    tone?: 'default' | 'info' | 'warning' | 'danger' | 'success'
  }> = fundDetail
    ? [
        {
          label: '총 약정',
          value: formatKRW(fundDetail.commitment_total ?? null),
          hint: `GP ${formatKRW(fundDetail.gp_commitment ?? null)}`,
        },
        {
          label: '투자 건수',
          value: `${investments?.length ?? 0}건`,
          hint: `투자 금액 ${formatKRW(totalInvestmentAmount)}`,
        },
        {
          label: '진행 워크플로',
          value: `${fundWorkflowInstances.filter((row) => row.status === 'active').length}건`,
          hint: `미완료 업무 ${pendingTasks.length}건`,
          tone: pendingTasks.length > 0 ? 'info' : 'default',
        },
        {
          label: '미수 서류',
          value: `${missingDocs?.length ?? 0}건`,
          hint: `미수령 보수 ${feePendingCount}건`,
          tone: (missingDocs?.length ?? 0) > 0 ? 'warning' : 'default',
        },
      ]
    : []

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center gap-2 text-sm text-[#64748b]">
        <Link to="/funds" className="hover:text-[#558ef8]">조합 관리</Link>
        <span>/</span>
        <span className="text-[#0f1f3d]">{fundDetail?.name ?? `조합 #${fundId}`}</span>
      </div>
      <PageHeader
        title={fundDetail?.name ?? `조합 #${fundId}`}
        subtitle="조합 개요, LP, 투자, 재무, 서류를 같은 작업대에서 관리합니다."
        meta={fundDetail ? (
          <>
            <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-1 text-[11px] font-semibold text-[#64748b]">
              {fundDetail.type || '유형 미지정'}
            </span>
            <span className="rounded-full border border-[#d8e5fb] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#64748b]">
              {labelStatus(fundDetail.status)}
            </span>
          </>
        ) : undefined}
      />

      {isLoading ? (
        <PageLoading />
      ) : !fundDetail ? (
        <p className="text-sm text-[#64748b]">조합을 찾을 수 없습니다.</p>
      ) : (
        <>
          <PageMetricStrip items={fundDetailMetrics} columns={4} />
          <div className="sticky top-0 z-10">
            <PageControlStrip compact className="bg-[#f5f9ff]/95 backdrop-blur">
              <div className="segmented-control w-full overflow-x-auto">
              {FUND_DETAIL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-btn min-w-fit px-4 py-2 text-sm ${activeTab === tab.id ? 'active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
              </div>
            </PageControlStrip>
          </div>

          {isOverviewTab && (editingFund ? (
            <FundForm
              initial={{ ...fundDetail, formation_date: fundDetail.formation_date || '' }}
              gpEntities={gpEntities}
              loading={updateFundMut.isPending}
              onSubmit={data => updateFundMut.mutate({ id: fundId, data })}
              onCancel={() => setEditingFund(false)}
            />
          ) : (
            <div className="card-base space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#0f1f3d]">{fundDetail.name}</h2>
                  <p className="text-sm text-[#64748b] mt-0.5">{fundDetail.type} | {labelStatus(fundDetail.status)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingFund(true)} className="px-2 py-1 text-xs bg-[#f5f9ff] rounded hover:bg-[#f5f9ff] flex items-center gap-1"><Pencil size={12} />수정</button>
                  <button onClick={() => { if (confirm('이 조합을 삭제하시겠습니까?')) deleteFundMut.mutate(fundId) }} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center gap-1"><Trash2 size={12} />삭제</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="p-2 bg-[#f5f9ff] rounded">결성일: {fundDetail.formation_date || '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">투자기간 종료일: {fundDetail.investment_period_end || '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">만기일: {fundDetail.maturity_date || '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">
                  GP 법인: {linkedGpEntity?.name || '-'}
                  {linkedGpEntity?.business_number ? ` (${linkedGpEntity.business_number})` : ''}
                </div>
                <div className="p-2 bg-[#f5f9ff] rounded">GP: {fundDetail.gp || '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">대표 펀드매니저: {fundDetail.fund_manager || '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">Co-GP: {fundDetail.co_gp || '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">신탁사: {fundDetail.trustee || '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">약정액: {formatKRW(fundDetail.commitment_total ?? null)}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">GP 출자금: {formatKRW(fundDetail.gp_commitment ?? null)}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">출자방식: {fundDetail.contribution_type || '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">관리보수율: {fundDetail.mgmt_fee_rate != null ? `${fundDetail.mgmt_fee_rate}%` : '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">성과보수율: {fundDetail.performance_fee_rate != null ? `${fundDetail.performance_fee_rate}%` : '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded">허들레이트: {fundDetail.hurdle_rate != null ? `${fundDetail.hurdle_rate}%` : '-'}</div>
                <div className="p-2 bg-[#f5f9ff] rounded md:col-span-3">운용계좌번호: {fundDetail.account_number || '-'}</div>
              </div>
            </div>
          ))}

          {isOverviewTab && isFormingFund && (
            <div className="card-base space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#0f1f3d]">결성 진행 컨트롤 패널</h3>
                  <p className="text-xs text-[#64748b]">필요한 결성 워크플로를 개별로 추가하세요.</p>
                </div>
                <div className="w-full md:w-56">
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">기준일</label>
                  <input
                    type="date"
                    value={formationWorkflowTriggerDate}
                    onChange={(event) => setFormationWorkflowTriggerDate(event.target.value)}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {FORMATION_WORKFLOW_BUTTONS.map((button) => {
                  const instance = formationWorkflowStateMap.get(button.key)
                  const isAdded = Boolean(instance)
                  const isPendingThisButton =
                    addFormationWorkflowMut.isPending &&
                    addFormationWorkflowMut.variables?.templateName === button.key
                  const disabled = isAdded || addFormationWorkflowMut.isPending || !formationWorkflowTriggerDate
                  const statusLabel = instance
                    ? FORMATION_WORKFLOW_STATUS_LABEL[(instance.status || '').trim().toLowerCase()] || '추가됨'
                    : null

                  return (
                    <button
                      key={button.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => openFormationTemplateModal(button.key, button.label)}
                      title={
                        isAdded
                          ? '이미 추가된 워크플로입니다.'
                          : !formationWorkflowTriggerDate
                            ? '기준일을 먼저 입력해주세요.'
                            : undefined
                      }
                      className={`rounded-lg border px-3 py-2 text-sm text-left transition ${
                        isAdded
                          ? 'border-[#d8e5fb] bg-[#f5f9ff] text-[#64748b] cursor-not-allowed'
                          : 'border-[#c5d8fb] bg-[#f5f9ff] text-[#1a3660] hover:bg-[#e6efff]'
                      } ${addFormationWorkflowMut.isPending && !isPendingThisButton ? 'opacity-70' : ''}`}
                    >
                      {isPendingThisButton
                        ? `${button.label} 생성 중...`
                        : isAdded
                          ? `${button.label} ${statusLabel} ✅`
                          : `+ ${button.label} 워크플로 추가`}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {isOverviewTab && (
            <>
              <div className="card-base space-y-3">
                <h3 className="text-sm font-semibold text-[#0f1f3d]">조합 요약</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    약정/납입
                    <p className="mt-1 font-semibold text-[#0f1f3d]">
                      {formatKRW(capitalCommitmentBase)} / {formatKRW(lpPaidInTotal)}
                    </p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    투자 포트폴리오
                    <p className="mt-1 font-semibold text-[#0f1f3d]">
                      {(investments?.length ?? 0)}건 / {formatKRW(totalInvestmentAmount)}
                    </p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    진행 워크플로
                    <p className="mt-1 font-semibold text-[#0f1f3d]">
                      {fundWorkflowInstances.filter((row) => row.status === 'active').length}건
                    </p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    미완료 업무
                    <p className="mt-1 font-semibold text-[#0f1f3d]">{pendingTasks.length}건</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded border border-[#d8e5fb] bg-white px-3 py-2">
                    <p className="text-xs font-semibold text-[#64748b]">최근 LP 변경</p>
                    {lpTransfers.length === 0 ? (
                      <p className="mt-1 text-xs text-[#64748b]">최근 변경 이력이 없습니다.</p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {[...lpTransfers]
                          .sort((a, b) => (b.id - a.id))
                          .slice(0, 5)
                          .map((row) => (
                            <p key={row.id} className="text-xs text-[#0f1f3d]">
                              {toDate(row.transfer_date)} | {row.from_lp_name} → {row.to_lp_name || '신규 LP'} | {labelStatus(row.status)}
                            </p>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-white px-3 py-2">
                    <p className="text-xs font-semibold text-[#64748b]">보고/문서 현황</p>
                    <div className="mt-1 space-y-1 text-xs text-[#0f1f3d]">
                      <p>미수 서류: {missingDocs?.length ?? 0}건</p>
                      <p>미수령 보수: {feePendingCount}건</p>
                      <p>대기/진행 양수양도: {lpTransfers.filter((row) => row.status !== 'completed' && row.status !== 'cancelled').length}건</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-base">
                <h3 className="text-sm font-semibold text-[#0f1f3d] mb-2">미수 서류</h3>
                {!missingDocs?.length ? (
                  <p className="text-sm text-[#64748b]">미수 서류가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {missingDocs.map((doc) => (
                      <div key={doc.id} className="border border-[#e6eefc] rounded p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[#0f1f3d]">{doc.document_name}</p>
                          {dueText(doc) && (
                            <span className={`${doc.days_remaining != null && doc.days_remaining < 0 ? 'tag tag-red' : 'tag tag-amber'}`}>
                              {dueText(doc)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#64748b] mt-0.5">{doc.company_name} | {doc.note || '-'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {formationTemplateModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => {
                if (addFormationWorkflowMut.isPending) return
                setFormationTemplateModal(null)
              }}
            >
              <div
                className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 className="text-base font-semibold text-[#0f1f3d]">템플릿 선택</h3>
                <p className="mt-1 text-sm text-[#64748b]">
                  [{formationTemplateModal.slotLabel}]에 매핑할 템플릿을 선택하세요.
                </p>

                <div className="mt-4 space-y-1">
                  <label className="block text-xs font-medium text-[#64748b]">워크플로 템플릿</label>
                  <select
                    value={selectedFormationTemplateId}
                    onChange={(event) => {
                      const next = event.target.value
                      setSelectedFormationTemplateId(next ? Number(next) : '')
                    }}
                    className="w-full rounded border px-3 py-2 text-sm"
                  >
                    <option value="">템플릿을 선택하세요</option>
                    {workflowTemplateOptions.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                        {template.category ? ` (${template.category})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {formationTemplateModal.slotKey === '결성총회 개최' && (
                  <div className="mt-3 rounded-lg border border-[#c5d8fb] bg-[#f5f9ff] px-3 py-2 text-xs text-[#1a3660]">
                    결성총회 관련 템플릿은 내부 단계명에
                    {' '}
                    <strong>출자금 납입 확인</strong>
                    {' '}
                    등 납입/출자 확인 키워드가 있어야 결성금액 동기화가 정상 작동합니다.
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setFormationTemplateModal(null)}
                    className="secondary-btn"
                    disabled={addFormationWorkflowMut.isPending}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleAddFormationWorkflow}
                    className="primary-btn"
                    disabled={addFormationWorkflowMut.isPending || !selectedFormationTemplateId}
                  >
                    {addFormationWorkflowMut.isPending ? '추가 중...' : '추가하기'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isCapitalTab && (
            <div className="card-base space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#0f1f3d]">자본 및 LP 현황</h3>
                  <p className="text-xs text-[#64748b]">LP별 약정/납입 현황을 한 화면에서 관리합니다.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowCapCallWizard(true)} className="secondary-btn">+ 출자요청 위저드</button>
                  <button onClick={() => setShowCreateLP(v => !v)} className="primary-btn inline-flex items-center gap-1"><Plus size={12} /> + LP 추가</button>
                </div>
              </div>

              {showCreateLP && (
                <div className="rounded-lg border border-[#d8e5fb] bg-[#f5f9ff]/40 p-3">
                  <LPForm
                    initial={EMPTY_LP}
                    addressBooks={lpAddressBooks}
                    loading={createLPMut.isPending}
                    onSubmit={data => createLPMut.mutate({ data })}
                    onCancel={() => setShowCreateLP(false)}
                  />
                </div>
              )}

              <div className="overflow-auto rounded-lg border border-[#d8e5fb]">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                    <tr>
                      <th className="sticky left-0 z-10 bg-[#f5f9ff] px-3 py-2 text-left">조합원(LP) 명</th>
                      <th className="px-3 py-2 text-left">성격(구분)</th>
                      <th className="px-3 py-2 text-right">총 약정액</th>
                      <th className="px-3 py-2 text-right">누적 납입액</th>
                      <th className="px-3 py-2 text-right">지분율(%)</th>
                      <th className="px-3 py-2 text-left">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {capitalGridRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-sm text-[#64748b]">등록된 LP가 없습니다.</td>
                      </tr>
                    ) : (
                      capitalGridRows.flatMap((lp) => {
                        const rows = [
                          <tr key={`row-${lp.id}`}>
                            <td
                              className="sticky left-0 z-[1] cursor-pointer bg-white px-3 py-2 font-medium text-[#0f1f3d] hover:text-[#1a3660]"
                              onClick={() => setExpandedLPId((prev) => (prev === lp.id ? null : lp.id))}
                            >
                              <span className="inline-flex items-center gap-1">
                                {expandedLPId === lp.id ? '▼' : '▶'}
                                {' '}
                                {lp.name}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[#0f1f3d]">{labelLpType(lp.type)}</td>
                            <td className="px-3 py-2 text-right">{formatKRW(lp.commitment)}</td>
                            <td className="px-3 py-2 text-right">{formatKRW(lp.paidIn)}</td>
                            <td className="px-3 py-2 text-right">{lp.shareRatio.toFixed(2)}%</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-[#64748b]">{lp.note}</span>
                                <div className="flex gap-1">
                                  <button onClick={() => setEditingLPId(lp.id)} className="secondary-btn">수정</button>
                                  <button
                                    onClick={() => generateContributionCertMut.mutate({ lpId: lp.id })}
                                    disabled={generateContributionCertMut.isPending && generateContributionCertMut.variables?.lpId === lp.id}
                                    className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    출자증서
                                  </button>
                                  <button onClick={() => setTransferSourceLp(lp)} className="rounded bg-[#f5f9ff] px-2 py-1 text-xs text-[#1a3660] hover:bg-[#e6efff]">양수양도</button>
                                  <button onClick={() => { if (confirm('이 LP를 삭제하시겠습니까?')) deleteLPMut.mutate(lp.id) }} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">삭제</button>
                                </div>
                              </div>
                            </td>
                          </tr>,
                        ]
                        if (editingLPId === lp.id) {
                          rows.push(
                            <tr key={`edit-${lp.id}`} className="bg-[#f5f9ff]">
                              <td colSpan={6} className="px-2 py-2">
                                <LPForm
                                  initial={lp}
                                  addressBooks={lpAddressBooks}
                                  loading={updateLPMut.isPending}
                                  onSubmit={data => updateLPMut.mutate({ lpId: lp.id, data })}
                                  onCancel={() => setEditingLPId(null)}
                                />
                              </td>
                            </tr>,
                          )
                        }
                        if (expandedLPId === lp.id) {
                          rows.push(
                            <tr key={`contrib-${lp.id}`} className="bg-[#f5f9ff]/20">
                              <td colSpan={6} className="px-0 py-0">
                                <LPContributionPanel
                                  fundId={fundId}
                                  lpId={lp.id}
                                  lpName={lp.name}
                                  commitment={Number(lp.commitment ?? 0)}
                                  contributionType={fundDetail?.contribution_type || null}
                                />
                              </td>
                            </tr>,
                          )
                        }
                        return rows
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#f5f9ff] font-semibold text-[#0f1f3d]">
                      <td className="sticky left-0 z-10 bg-[#f5f9ff] px-3 py-2">합계(Total)</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right">{formatKRW(capitalCommitmentBase)}</td>
                      <td className="px-3 py-2 text-right">{formatKRW(lpPaidInTotal)}</td>
                      <td className="px-3 py-2 text-right">{capitalCommitmentBase > 0 ? '100.00%' : '0.00%'}</td>
                      <td className="px-3 py-2 text-xs text-[#64748b]">{capitalGridRows.length}명</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs text-[#64748b] md:grid-cols-3">
                <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2">최초 결성 납입액: <strong>{formatKRW(initialPaidIn)}</strong></div>
                <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2">후속 캐피탈콜 납입액: <strong>{formatKRW(nonInitialCallsPaidTotal)}</strong></div>
                <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2">총 누적 납입액: <strong>{formatKRW(historyTotalPaidIn)}</strong></div>
              </div>

              {splitCapitalCalls.nonInitial.length > 0 && (
                <div className="rounded-lg border border-[#d8e5fb] bg-[#f5f9ff]/60 p-3">
                  <h4 className="text-xs font-semibold text-[#64748b]">최근 캐피탈콜 연계</h4>
                  <div className="mt-2 space-y-1">
                    {splitCapitalCalls.nonInitial.slice(-5).reverse().map((call) => (
                      <div key={call.id} className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
                        <span>{call.call_date || '-'} / {formatKRW(callPaidAmountById.get(call.id) ?? Number(call.total_amount || 0))}</span>
                        {call.linked_workflow_instance_id ? (
                          <button
                            type="button"
                            onClick={() => navigate('/workflows', { state: { expandInstanceId: call.linked_workflow_instance_id } })}
                            className="inline-flex items-center rounded-full bg-[#f5f9ff] px-2 py-0.5 text-[11px] font-medium text-[#1a3660] hover:bg-[#e6efff]"
                          >
                            {buildLinkedWorkflowLabel(call, fundDetail.name)}
                            {call.linked_workflow_status
                              ? ` · ${WORKFLOW_STATUS_LABEL[call.linked_workflow_status] || call.linked_workflow_status}`
                              : ''}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-[#d8e5fb] bg-white p-3">
                <h4 className="text-xs font-semibold text-[#64748b]">LP 양수양도 이력</h4>
                {!lpTransfers.length ? (
                  <p className="mt-2 text-sm text-[#64748b]">등록된 양수양도 이력이 없습니다.</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {lpTransfers.map((transfer) => (
                      <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#d8e5fb] p-2 text-xs">
                        <div className="min-w-0">
                          <p className="truncate text-[#0f1f3d]">
                            {transfer.from_lp_name || transfer.from_lp_id}
                            {' '}
                            →
                            {' '}
                            {transfer.to_lp_name || transfer.to_lp_id || '신규 LP'}
                            {' '}
                            |
                            {' '}
                            {formatKRW(transfer.transfer_amount)}
                          </p>
                          <p className="mt-0.5 text-[#64748b]">
                            {transfer.transfer_date || '-'}
                            {' '}
                            |
                            {' '}
                            {transfer.workflow_instance_id
                              ? buildTransferWorkflowLabel(transfer, fundDetail.name || '조합')
                              : '수동 진행'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              transfer.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : transfer.status === 'cancelled'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-[#f5f9ff] text-[#1a3660]'
                            }`}
                          >
                            {LP_TRANSFER_STATUS_LABEL[transfer.status] || transfer.status}
                          </span>
                          {transfer.status !== 'completed' && (
                            <button
                              onClick={() => completeLPTransferMut.mutate(transfer.id)}
                              className="tag tag-emerald hover:opacity-90"
                            >
                              완료
                            </button>
                          )}
                          {transfer.status !== 'cancelled' && transfer.status !== 'completed' && (
                            <button
                              onClick={() => cancelLPTransferMut.mutate(transfer.id)}
                              className="tag tag-red hover:opacity-90"
                            >
                              취소
                            </button>
                          )}
                          {transfer.workflow_instance_id && (
                            <button
                              onClick={() => navigate('/workflows', { state: { expandInstanceId: transfer.workflow_instance_id } })}
                              className="tag tag-blue hover:opacity-90"
                            >
                              워크플로
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-[#d8e5fb] bg-white p-3 space-y-2">
                <h4 className="text-xs font-semibold text-[#64748b]">배분</h4>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748b]">배분일</label>
                    <input
                      type="date"
                      value={newDistribution.dist_date}
                      onChange={(event) => setNewDistribution((prev) => ({ ...prev, dist_date: event.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748b]">배분 유형</label>
                    <select
                      value={newDistribution.dist_type}
                      onChange={(event) => setNewDistribution((prev) => ({ ...prev, dist_type: event.target.value }))}
                      className="form-input"
                    >
                      {DIST_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>{labelDistributionType(type)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748b]">원금 총액</label>
                    <KrwAmountInput
                      value={newDistribution.principal_total || 0}
                      onChange={(next) =>
                        setNewDistribution((prev) => ({ ...prev, principal_total: next ?? 0 }))
                      }
                      className="form-input"
                      helperClassName="mt-1 text-[10px] text-[#64748b]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748b]">수익 총액</label>
                    <KrwAmountInput
                      value={newDistribution.profit_total || 0}
                      onChange={(next) =>
                        setNewDistribution((prev) => ({ ...prev, profit_total: next ?? 0 }))
                      }
                      className="form-input"
                      helperClassName="mt-1 text-[10px] text-[#64748b]"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() =>
                        createDistMut.mutate({
                          ...newDistribution,
                          fund_id: fundId,
                          memo: newDistribution.memo?.trim() || null,
                        })
                      }
                      className="primary-btn"
                    >
                      등록
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {distributions.map((row) => (
                    <div key={row.id} className="rounded border border-[#d8e5fb] p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-[#0f1f3d]">
                          {toDate(row.dist_date)}
                          {' '}
                          |
                          {' '}
                          {labelDistributionType(row.dist_type)}
                          {' '}
                          |
                          {' '}
                          원금 총액
                          {' '}
                          {formatKRW(row.principal_total)}
                          {' '}
                          |
                          {' '}
                          수익 총액
                          {' '}
                          {formatKRW(row.profit_total)}
                        </p>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setDistExpandedId(distExpandedId === row.id ? null : row.id)}
                            className="rounded bg-[#f5f9ff] px-2 py-1 text-xs text-[#1a3660] hover:bg-[#e6efff]"
                          >
                            LP 내역
                          </button>
                          <button onClick={() => toggleDistributionEdit(row)} className="secondary-btn">수정</button>
                          <button onClick={() => deleteDistMut.mutate(row.id)} className="danger-btn">삭제</button>
                        </div>
                      </div>

                      {editingDistId === row.id && editDistribution && (
                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[#64748b]">배분일</label>
                            <input
                              type="date"
                              value={editDistribution.dist_date}
                              onChange={(event) =>
                                setEditDistribution((prev) => (prev ? { ...prev, dist_date: event.target.value } : prev))
                              }
                              className="form-input"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[#64748b]">배분 유형</label>
                            <select
                              value={editDistribution.dist_type}
                              onChange={(event) =>
                                setEditDistribution((prev) => (prev ? { ...prev, dist_type: event.target.value } : prev))
                              }
                              className="form-input"
                            >
                              {DIST_TYPE_OPTIONS.map((type) => (
                                <option key={type} value={type}>{labelDistributionType(type)}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[#64748b]">원금 총액</label>
                            <KrwAmountInput
                              value={editDistribution.principal_total}
                              onChange={(next) =>
                                setEditDistribution((prev) =>
                                  prev ? { ...prev, principal_total: next ?? 0 } : prev
                                )
                              }
                              className="form-input"
                              helperClassName="mt-1 text-[10px] text-[#64748b]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[#64748b]">수익 총액</label>
                            <KrwAmountInput
                              value={editDistribution.profit_total}
                              onChange={(next) =>
                                setEditDistribution((prev) =>
                                  prev ? { ...prev, profit_total: next ?? 0 } : prev
                                )
                              }
                              className="form-input"
                              helperClassName="mt-1 text-[10px] text-[#64748b]"
                            />
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() =>
                                updateDistMut.mutate({
                                  distId: row.id,
                                  data: {
                                    dist_date: editDistribution.dist_date,
                                    dist_type: editDistribution.dist_type,
                                    principal_total: editDistribution.principal_total,
                                    profit_total: editDistribution.profit_total,
                                    performance_fee: editDistribution.performance_fee,
                                    memo: editDistribution.memo.trim() || null,
                                  },
                                })
                              }
                              className="primary-btn"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => {
                                setEditingDistId(null)
                                setEditDistribution(null)
                              }}
                              className="secondary-btn"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )}

                      {distExpandedId === row.id && (
                        <div className="mt-2 rounded bg-[#f5f9ff] p-2 space-y-2">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[#64748b]">LP</label>
                              <select
                                value={newDistributionItem.lp_id || ''}
                                onChange={(event) =>
                                  setNewDistributionItem((prev) => ({ ...prev, lp_id: Number(event.target.value) || 0 }))
                                }
                                className="form-input"
                              >
                                <option value="">LP</option>
                                {(fundDetail.lps ?? []).map((lp) => (
                                  <option key={lp.id} value={lp.id}>{lp.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[#64748b]">원금</label>
                              <KrwAmountInput
                                value={newDistributionItem.principal || 0}
                                onChange={(next) =>
                                  setNewDistributionItem((prev) => ({ ...prev, principal: next ?? 0 }))
                                }
                                className="form-input"
                                helperClassName="mt-1 text-[10px] text-[#64748b]"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[#64748b]">수익</label>
                              <KrwAmountInput
                                value={newDistributionItem.profit || 0}
                                onChange={(next) =>
                                  setNewDistributionItem((prev) => ({ ...prev, profit: next ?? 0 }))
                                }
                                className="form-input"
                                helperClassName="mt-1 text-[10px] text-[#64748b]"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                onClick={() => {
                                  if (!newDistributionItem.lp_id) return
                                  createDistItemMut.mutate({ distributionId: row.id, data: newDistributionItem })
                                }}
                                className="primary-btn"
                              >
                                항목 추가
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            {distributionItems.map((item) => (
                              <div key={item.id} className="flex items-center justify-between rounded border border-[#d8e5fb] bg-white p-2">
                                {editingDistItemId === item.id && editDistributionItem ? (
                                  <div className="w-full grid grid-cols-1 gap-2 md:grid-cols-4">
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-[#64748b]">원금</label>
                                      <KrwAmountInput
                                        value={editDistributionItem.principal}
                                        onChange={(next) =>
                                          setEditDistributionItem((prev) =>
                                            prev ? { ...prev, principal: next ?? 0 } : prev
                                          )
                                        }
                                        className="form-input"
                                        helperClassName="mt-1 text-[10px] text-[#64748b]"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-[#64748b]">수익</label>
                                      <KrwAmountInput
                                        value={editDistributionItem.profit}
                                        onChange={(next) =>
                                          setEditDistributionItem((prev) =>
                                            prev ? { ...prev, profit: next ?? 0 } : prev
                                          )
                                        }
                                        className="form-input"
                                        helperClassName="mt-1 text-[10px] text-[#64748b]"
                                      />
                                    </div>
                                    <button
                                      onClick={() =>
                                        updateDistItemMut.mutate({
                                          distributionId: row.id,
                                          itemId: item.id,
                                          data: {
                                            principal: editDistributionItem.principal,
                                            profit: editDistributionItem.profit,
                                          },
                                        })
                                      }
                                      className="primary-btn"
                                    >
                                      저장
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingDistItemId(null)
                                        setEditDistributionItem(null)
                                      }}
                                      className="secondary-btn"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-xs text-[#64748b]">
                                      LP
                                      {' '}
                                      {item.lp_name || item.lp_id}
                                      {' '}
                                      |
                                      {' '}
                                      원금
                                      {' '}
                                      {formatKRW(item.principal)}
                                      {' '}
                                      |
                                      {' '}
                                      수익
                                      {' '}
                                      {formatKRW(item.profit)}
                                    </p>
                                    <div className="flex gap-1">
                                      <button onClick={() => toggleDistributionItemEdit(item)} className="secondary-btn">수정</button>
                                      <button
                                        onClick={() => deleteDistItemMut.mutate({ distributionId: row.id, itemId: item.id })}
                                        className="danger-btn"
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {distributions.length === 0 && (
                    <p className="text-sm text-[#64748b]">등록된 배분 내역이 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {isFinanceTab && (
            <>
              <div className="card-base space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0f1f3d]">통지기간</h3>
              {!editingNotices ? (
                <button
                  onClick={() => {
                    setNoticeDraft(buildNoticeDraft(fundDetail))
                    setEditingNotices(true)
                  }}
                  className="secondary-btn"
                >
                  수정
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => saveNoticeMut.mutate(noticeDraft)} disabled={saveNoticeMut.isPending} className="primary-btn">저장</button>
                  <button
                    onClick={() => {
                      setEditingNotices(false)
                      setNoticeDraft(buildNoticeDraft(fundDetail))
                    }}
                    className="secondary-btn"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>

            {!editingNotices ? (
              (fundDetail.notice_periods?.length ?? 0) === 0 ? (
                <p className="text-sm text-[#64748b]">등록된 통지기간이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {(fundDetail.notice_periods ?? []).map((row) => (
                    <div key={row.id} className="grid grid-cols-1 gap-2 rounded-lg border border-[#d8e5fb] p-2 text-sm md:grid-cols-12">
                      <div className="md:col-span-4 font-medium text-[#0f1f3d]">{row.label}</div>
                      <div className="md:col-span-3 text-[#0f1f3d]">
                        {row.business_days}{row.day_basis === 'calendar' ? '일' : '영업일'}
                      </div>
                      <div className="md:col-span-5 text-[#64748b]">{row.memo || '-'}</div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-2">
                {noticeDraft.map((row, idx) => (
                  <div key={row._row_id} className="grid grid-cols-1 gap-2 rounded-lg border border-[#d8e5fb] p-2 md:grid-cols-12">
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-[10px] font-medium text-[#64748b]">표시명</label>
                      <input
                        value={row.label}
                        onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, label: e.target.value } : item))}
                        placeholder="표시명"
                        className="form-input"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-[10px] font-medium text-[#64748b]">통지기간</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={row.business_days}
                          onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, business_days: Math.max(0, Number(e.target.value || 0)) } : item))}
                          placeholder="통지일수"
                          className="w-24 rounded border px-2 py-1 text-sm"
                        />
                        <select
                          value={row.day_basis === 'calendar' ? 'calendar' : 'business'}
                          onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, day_basis: e.target.value as 'business' | 'calendar' } : item))}
                          className="rounded border px-2 py-1 text-sm"
                        >
                          <option value="business">영업일</option>
                          <option value="calendar">일반일</option>
                        </select>
                      </div>
                    </div>
                    <div className="md:col-span-3">
                      <label className="mb-1 block text-[10px] font-medium text-[#64748b]">메모/조항</label>
                      <input
                        value={row.memo || ''}
                        onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, memo: e.target.value } : item))}
                        placeholder="메모 / 조항"
                        className="form-input"
                      />
                    </div>
                    <button
                      onClick={() => setNoticeDraft((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))}
                      className="md:col-span-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => setNoticeDraft((prev) => [...prev, {
                    _row_id: `notice-new-${Date.now()}-${prev.length}`,
                    notice_type: `custom_${Date.now()}`,
                    label: '',
                    business_days: 0,
                    day_basis: 'business',
                    memo: '',
                  }])}
                  className="secondary-btn"
                >
                  + 통지기간 추가
                </button>
              </div>
            )}
              </div>

              <div className="card-base space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0f1f3d]">주요 계약 조항</h3>
              {!editingKeyTerms ? (
                <button
                  onClick={() => {
                    setKeyTermDraft(buildKeyTermDraft(fundDetail))
                    setEditingKeyTerms(true)
                  }}
                  className="secondary-btn"
                >
                  수정
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => saveKeyTermsMut.mutate(keyTermDraft)} disabled={saveKeyTermsMut.isPending} className="primary-btn">저장</button>
                  <button
                    onClick={() => {
                      setEditingKeyTerms(false)
                      setKeyTermDraft(buildKeyTermDraft(fundDetail))
                    }}
                    className="secondary-btn"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>

            {!editingKeyTerms ? (
              keyTermsByCategory.length === 0 ? (
                <p className="text-sm text-[#64748b]">등록된 계약 조항이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {keyTermsByCategory.map(([category, rows]) => (
                    <div key={category} className="border border-[#d8e5fb] rounded-lg p-3">
                      <p className="text-xs font-semibold text-[#64748b] mb-2">[{category}]</p>
                      <div className="space-y-2">
                        {rows.map((row, idx) => (
                          <div key={`${category}-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm">
                            <div className="md:col-span-3 font-medium text-[#0f1f3d]">{row.label}</div>
                            <div className="md:col-span-7 text-[#0f1f3d]">{row.value}</div>
                            <div className="md:col-span-2 text-[#64748b]">{row.article_ref || '-'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-2">
                {keyTermDraft.map((row, idx) => (
                  <div key={row._row_id} className="grid grid-cols-1 md:grid-cols-14 gap-2 border border-[#d8e5fb] rounded-lg p-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium text-[#64748b]">카테고리</label>
                      <input
                        value={row.category}
                        onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, category: e.target.value } : item))}
                        placeholder="카테고리"
                        className="form-input"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="mb-1 block text-[10px] font-medium text-[#64748b]">조항</label>
                      <input
                        value={row.label}
                        onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, label: e.target.value } : item))}
                        placeholder="조항"
                        className="form-input"
                      />
                    </div>
                    <div className="md:col-span-5">
                      <label className="mb-1 block text-[10px] font-medium text-[#64748b]">내용</label>
                      <input
                        value={row.value}
                        onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, value: e.target.value } : item))}
                        placeholder="내용"
                        className="form-input"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium text-[#64748b]">조문</label>
                      <input
                        value={row.article_ref || ''}
                        onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, article_ref: e.target.value } : item))}
                        placeholder="조문"
                        className="form-input"
                      />
                    </div>
                    <div className="md:col-span-2 flex gap-1">
                      <button
                        onClick={() => {
                          if (idx === 0) return
                          setKeyTermDraft((prev) => {
                            const next = [...prev]
                            const temp = next[idx - 1]
                            next[idx - 1] = next[idx]
                            next[idx] = temp
                            return next
                          })
                        }}
                        className="px-2 py-1 text-xs rounded bg-[#f5f9ff] hover:bg-[#f5f9ff]"
                        title="위로"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => {
                          if (idx === keyTermDraft.length - 1) return
                          setKeyTermDraft((prev) => {
                            const next = [...prev]
                            const temp = next[idx + 1]
                            next[idx + 1] = next[idx]
                            next[idx] = temp
                            return next
                          })
                        }}
                        className="px-2 py-1 text-xs rounded bg-[#f5f9ff] hover:bg-[#f5f9ff]"
                        title="아래로"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => setKeyTermDraft((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))}
                        className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setKeyTermDraft((prev) => [...prev, {
                    _row_id: `term-new-${Date.now()}-${prev.length}`,
                    category: '기타',
                    label: '',
                    value: '',
                    article_ref: '',
                  }])}
                  className="secondary-btn"
                >
                  + 조항 추가
                </button>
              </div>
            )}
              </div>
              <div className="card-base space-y-2">
                <h3 className="text-sm font-semibold text-[#0f1f3d]">총회</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748b]">총회일</label>
                    <input
                      type="date"
                      value={newAssembly.date}
                      onChange={(event) => setNewAssembly((prev) => ({ ...prev, date: event.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748b]">총회 유형</label>
                    <select
                      value={newAssembly.type}
                      onChange={(event) => setNewAssembly((prev) => ({ ...prev, type: event.target.value }))}
                      className="form-input"
                    >
                      {ASSEMBLY_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>{labelAssemblyType(type)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
                    <select
                      value={newAssembly.status || ''}
                      onChange={(event) => setNewAssembly((prev) => ({ ...prev, status: event.target.value }))}
                      className="form-input"
                    >
                      {ASSEMBLY_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{labelStatus(status)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#64748b]">안건</label>
                    <input
                      value={newAssembly.agenda || ''}
                      onChange={(event) => setNewAssembly((prev) => ({ ...prev, agenda: event.target.value }))}
                      className="form-input"
                      placeholder="선택 입력"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() =>
                        createAssemblyMut.mutate({
                          ...newAssembly,
                          fund_id: fundId,
                          agenda: newAssembly.agenda?.trim() || null,
                        })
                      }
                      className="primary-btn"
                    >
                      등록
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  {assemblies.map((row) => (
                    <div key={row.id} className="rounded border border-[#d8e5fb] p-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-[#0f1f3d]">
                          {toDate(row.date)}
                          {' '}
                          |
                          {' '}
                          {labelAssemblyType(row.type)}
                          {' '}
                          |
                          {' '}
                          {labelStatus(row.status)}
                          {' '}
                          |
                          {' '}
                          의사록
                          {' '}
                          {row.minutes_completed ? '작성 완료' : '미작성'}
                        </p>
                        <div className="flex gap-1">
                          <button onClick={() => toggleAssemblyEdit(row)} className="secondary-btn">수정</button>
                          <button onClick={() => deleteAssemblyMut.mutate(row.id)} className="danger-btn">삭제</button>
                        </div>
                      </div>

                      {editingAssemblyId === row.id && editAssembly && (
                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[#64748b]">총회일</label>
                            <input
                              type="date"
                              value={editAssembly.date}
                              onChange={(event) =>
                                setEditAssembly((prev) => (prev ? { ...prev, date: event.target.value } : prev))
                              }
                              className="form-input"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[#64748b]">총회 유형</label>
                            <select
                              value={editAssembly.type}
                              onChange={(event) =>
                                setEditAssembly((prev) => (prev ? { ...prev, type: event.target.value } : prev))
                              }
                              className="form-input"
                            >
                              {ASSEMBLY_TYPE_OPTIONS.map((type) => (
                                <option key={type} value={type}>{labelAssemblyType(type)}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
                            <select
                              value={editAssembly.status}
                              onChange={(event) =>
                                setEditAssembly((prev) => (prev ? { ...prev, status: event.target.value } : prev))
                              }
                              className="form-input"
                            >
                              {ASSEMBLY_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{labelStatus(status)}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-[#64748b]">안건</label>
                            <input
                              value={editAssembly.agenda}
                              onChange={(event) =>
                                setEditAssembly((prev) => (prev ? { ...prev, agenda: event.target.value } : prev))
                              }
                              className="form-input"
                            />
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() =>
                                updateAssemblyMut.mutate({
                                  assemblyId: row.id,
                                  data: {
                                    date: editAssembly.date,
                                    type: editAssembly.type,
                                    status: editAssembly.status,
                                    agenda: editAssembly.agenda.trim() || null,
                                    minutes_completed: editAssembly.minutes_completed,
                                    memo: editAssembly.memo.trim() || null,
                                  },
                                })
                              }
                              className="primary-btn"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => {
                                setEditingAssemblyId(null)
                                setEditAssembly(null)
                              }}
                              className="secondary-btn"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {assemblies.length === 0 && (
                    <p className="text-sm text-[#64748b]">등록된 총회가 없습니다.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {isInvestmentsTab && (
            <div className="card-base">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0f1f3d]">투자 내역</h3>
                <div className="flex rounded border text-xs">
                  <button
                    onClick={() => setInvestmentViewMode('cards')}
                    className={`px-2 py-1 ${investmentViewMode === 'cards' ? 'primary-btn' : 'text-[#64748b]'}`}
                  >
                    카드
                  </button>
                  <button
                    onClick={() => setInvestmentViewMode('table')}
                    className={`px-2 py-1 ${investmentViewMode === 'table' ? 'primary-btn' : 'text-[#64748b]'}`}
                  >
                    목록
                  </button>
                </div>
              </div>

              {!investments?.length ? (
                <p className="text-sm text-[#64748b]">등록된 투자가 없습니다.</p>
              ) : investmentViewMode === 'cards' ? (
                <div className="space-y-2">
                  {investments.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => navigate(`/investments/${inv.id}`)}
                      className="w-full rounded-xl border border-[#e6eefc] p-3 text-left hover:bg-[#f5f9ff]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[#0f1f3d]">{inv.company_name || `투자 #${inv.id}`}</span>
                        <ChevronRight size={16} className="text-[#64748b]" />
                      </div>
                      <p className="mt-1 text-xs text-[#64748b]">
                        {inv.investment_date ? new Date(inv.investment_date).toLocaleDateString('ko-KR') : '-'} |
                        {' '}{formatKRW(inv.amount ?? null)} |
                        {' '}{labelStatus(inv.status || 'pending')}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                      <tr>
                        <th className="px-3 py-2 text-left">투자기업명</th>
                        <th className="px-3 py-2 text-left">설립일</th>
                        <th className="px-3 py-2 text-left">업종</th>
                        <th className="px-3 py-2 text-left">투자수단</th>
                        <th className="px-3 py-2 text-right">투자총액</th>
                        <th className="px-3 py-2 text-center">회수완료</th>
                        <th className="px-3 py-2 text-left">투자일자</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {investments.map((inv) => (
                        <tr
                          key={inv.id}
                          className="cursor-pointer hover:bg-[#f5f9ff]"
                          onClick={() => navigate(`/investments/${inv.id}`)}
                        >
                          <td className="px-3 py-2 font-medium text-[#0f1f3d]">{inv.company_name || '-'}</td>
                          <td className="px-3 py-2 text-[#64748b]">{inv.company_founded_date || '-'}</td>
                          <td className="px-3 py-2 text-[#64748b]">{inv.industry || '-'}</td>
                          <td className="px-3 py-2 text-[#0f1f3d]">{inv.instrument || '-'}</td>
                          <td className="px-3 py-2 text-right">{formatKRW(inv.amount ?? null)}</td>
                          <td className="px-3 py-2 text-center">{inv.status === 'exited' ? 'Y' : '-'}</td>
                          <td className="px-3 py-2 text-[#64748b]">{inv.investment_date || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {isInvestmentsTab && (
            <div className="card-base space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0f1f3d]">NAV 추이</h3>
                <button onClick={() => navigate('/valuations')} className="secondary-btn">가치평가 화면으로 이동</button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                  최신 NAV
                  <p className="mt-1 text-lg font-semibold text-[#0f1f3d]">{formatKRW(latestNav)}</p>
                </div>
                <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                  평가 레코드 수
                  <p className="mt-1 text-lg font-semibold text-[#0f1f3d]">{fundValuations.length}건</p>
                </div>
                <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                  시계열 포인트
                  <p className="mt-1 text-lg font-semibold text-[#0f1f3d]">{navSeries.length}개</p>
                </div>
              </div>

              {navSeries.length === 0 ? (
                <p className="rounded border border-dashed border-[#bfcff0] px-3 py-8 text-center text-sm text-[#64748b]">
                  NAV 추이를 계산할 평가 데이터가 없습니다.
                </p>
              ) : (
                <div className="rounded border border-[#d8e5fb] bg-white p-3">
                  <svg viewBox="0 0 100 36" className="h-32 w-full">
                    {navSparklinePath ? (
                      <path d={navSparklinePath} fill="none" stroke="#558ef8" strokeWidth="2.2" strokeLinecap="round" />
                    ) : (
                      <line x1="0" y1="18" x2="100" y2="18" stroke="#dce8ff" strokeWidth="2" />
                    )}
                  </svg>
                  <div className="mt-2 overflow-auto">
                    <table className="min-w-[480px] w-full text-sm">
                      <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                        <tr>
                          <th className="px-3 py-2 text-left">기준일</th>
                          <th className="px-3 py-2 text-right">NAV</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[...navSeries].reverse().slice(0, 8).map((row) => (
                          <tr key={row.date}>
                            <td className="px-3 py-2">{toDate(row.date)}</td>
                            <td className="px-3 py-2 text-right">{formatKRW(row.nav)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {isFinanceTab && (
            <div className="space-y-3">
              <div className="card-base space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">??? ?? ??</h3>
                    <p className="text-xs text-[#64748b]">?? ??? ???? ?? ? ??? ??? ?? ???? ??????.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => navigate(`/fee-management?fund=${fundId}&tab=management`)} className="secondary-btn">???? ??</button>
                    <button onClick={() => navigate(`/fee-management?fund=${fundId}&tab=performance`)} className="secondary-btn">???? ??</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    ?????
                    <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{formatPercentValue(effectiveMgmtFeeRate)}</p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    ?????
                    <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{formatPercentValue(effectivePerformanceFeeRate)}</p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    ?????
                    <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{formatPercentValue(effectiveHurdleRate)}</p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    ???? ??
                    <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{feeBasisLabel(fundFeeConfig?.mgmt_fee_basis)}</p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    ?? ????
                    <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{formatKRW(feeTotalAmount)}</p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    ??? ??
                    <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{feePendingCount}?</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="card-base space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">???? ??</h3>
                    <span className="text-xs text-[#64748b]">{fundManagementFees.length}?</span>
                  </div>
                  <div className="overflow-auto rounded border border-[#d8e5fb]">
                    <table className="min-w-[860px] w-full text-sm">
                      <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                        <tr>
                          <th className="px-3 py-2 text-left">??</th>
                          <th className="px-3 py-2 text-left">????</th>
                          <th className="px-3 py-2 text-left">??</th>
                          <th className="px-3 py-2 text-left">????</th>
                          <th className="px-3 py-2 text-right">????</th>
                          <th className="px-3 py-2 text-right">????</th>
                          <th className="px-3 py-2 text-left">??</th>
                          <th className="px-3 py-2 text-left">??/???</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {fundManagementFees.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-sm text-[#64748b]">???? ??? ????.</td>
                          </tr>
                        ) : (
                          fundManagementFees.map((row) => (
                            <tr key={row.id}>
                              <td className="px-3 py-2">{row.year} Q{row.quarter}</td>
                              <td className="px-3 py-2">{feePhaseLabel(row.applied_phase)}</td>
                              <td className="px-3 py-2">{feeBasisLabel(row.fee_basis)}</td>
                              <td className="px-3 py-2">{prorationMethodLabel(row.proration_method)}</td>
                              <td className="px-3 py-2 text-right">{formatKRW(row.basis_amount)}</td>
                              <td className="px-3 py-2 text-right">{formatKRW(row.fee_amount)}</td>
                              <td className="px-3 py-2">{row.status}</td>
                              <td className="px-3 py-2">{toDate(row.payment_date || row.invoice_date)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card-base space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">????</h3>
                    <span className="text-xs text-[#64748b]">????? {fundPerformanceFees.length}?</span>
                  </div>

                  {latestPerformanceFee ? (
                    <>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                          ?? ????
                          <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{scenarioLabel(latestPerformanceFee.scenario)}</p>
                        </div>
                        <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                          ??
                          <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{latestPerformanceFee.status}</p>
                        </div>
                        <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                          ? ???
                          <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{formatKRW(latestPerformanceFee.total_distributed)}</p>
                        </div>
                        <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                          GP ??
                          <p className="mt-1 text-base font-semibold text-[#0f1f3d]">{formatKRW(latestPerformanceFee.carry_amount)}</p>
                        </div>
                      </div>

                      <div className="rounded border border-[#d8e5fb] bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-semibold text-[#0f1f3d]">??? ??</p>
                          <span className="text-[11px] text-[#64748b]">??? {toDate(latestPerformanceFee.simulation_date)}</span>
                        </div>
                        {fundWaterfall ? (
                          <WaterfallSummary {...fundWaterfall} />
                        ) : (
                          <p className="rounded border border-dashed border-[#d8e5fb] px-3 py-8 text-center text-sm text-[#64748b]">??? ???? ??? ?? ?????? ???? ?????.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded border border-dashed border-[#d8e5fb] px-3 py-10 text-center text-sm text-[#64748b]">
                      ???? ????? ??? ????. ?? ? ????? ?????? ???? ? ?? ??? ?????.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="card-base space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">총회 패키지 준비</h3>
                    <p className="mt-1 text-xs text-[#64748b]">
                      공문, 의안설명서, 영업보고서, 의결서, 의사록 패키지를 ERP 데이터 기준으로 어떤 방식으로 준비할지 보여줍니다.
                    </p>
                  </div>
                  {meetingPacketPlan && (
                    <span className="tag tag-blue">추천: {meetingPacketPlan.recommended_packet_label}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label htmlFor="meeting-packet-type">
                    <span className="mb-1 block text-xs font-medium text-[#64748b]">패키지 유형</span>
                    <select
                      id="meeting-packet-type"
                      name="meeting_packet_type"
                      className="form-input"
                      value={meetingPacketType}
                      onChange={(event) => setMeetingPacketType(event.target.value)}
                    >
                      {MEETING_PACKET_TYPE_OPTIONS.map((option) => (
                        <option key={option.value || 'auto'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-end">
                    <span className="inline-flex items-center gap-2 rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-xs text-[#0f1f3d]">
                      <input
                        id="meeting-packet-include-bylaw"
                        name="meeting_packet_include_bylaw"
                        type="checkbox"
                        checked={includeBylawAmendmentInPacket}
                        onChange={(event) => setIncludeBylawAmendmentInPacket(event.target.checked)}
                      />
                      규약 변경 안건 포함
                    </span>
                  </label>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    <p className="text-xs text-[#64748b]">수신자 미리보기</p>
                    <p className="mt-1 font-medium text-[#0f1f3d]">{meetingPacketPlan?.recipients_preview.slice(0, 3).join(', ') || '조합원 데이터 확인 필요'}</p>
                  </div>
                  <div className="rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-sm">
                    <p className="text-xs text-[#64748b]">안건 미리보기</p>
                    <p className="mt-1 font-medium text-[#0f1f3d]">{meetingPacketPlan?.agenda_preview.join(' / ') || '기본 안건 미정'}</p>
                  </div>
                </div>

                {meetingPacketPlan && (
                  <>
                    <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold text-[#64748b]">추천 이유</p>
                          <div className="mt-2 space-y-1 text-sm text-[#0f1f3d]">
                            {meetingPacketPlan.packet_reasoning.length > 0 ? (
                              meetingPacketPlan.packet_reasoning.map((item, idx) => (
                                <p key={`packet-reason-${idx}`}>- {item}</p>
                              ))
                            ) : (
                              <p>- 기본 패키지 유형을 사용합니다.</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#64748b]">사전 확인 경고</p>
                          <div className="mt-2 space-y-1 text-sm text-[#0f1f3d]">
                            {meetingPacketPlan.warnings.length > 0 ? (
                              meetingPacketPlan.warnings.map((item, idx) => (
                                <p key={`packet-warning-${idx}`} className="text-amber-700">- {item}</p>
                              ))
                            ) : (
                              <p>- 현재 기준으로 큰 경고는 없습니다.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-auto rounded-xl border border-[#d8e5fb]">
                      <table className="min-w-[980px] w-full text-sm">
                        <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                          <tr>
                            <th className="px-3 py-2 text-left">문서</th>
                            <th className="px-3 py-2 text-left">준비 상태</th>
                            <th className="px-3 py-2 text-left">생성 방식</th>
                            <th className="px-3 py-2 text-left">레이아웃</th>
                            <th className="px-3 py-2 text-left">연결 데이터</th>
                            <th className="px-3 py-2 text-left">사전 확인</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {meetingPacketPlan.slots.map((slot) => (
                            <tr key={slot.slot}>
                              <td className="px-3 py-2">
                                <div className="font-medium text-[#0f1f3d]">{slot.slot_label}</div>
                                <div className="text-xs text-[#64748b]">
                                  {slot.template_candidate || slot.builder_candidate || '-'}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    slot.status === 'ready'
                                      ? 'tag tag-green'
                                      : slot.status === 'partial' || slot.status === 'assisted'
                                        ? 'tag tag-amber'
                                        : slot.status === 'external_required'
                                          ? 'tag tag-red'
                                          : 'tag tag-gray'
                                  }
                                >
                                  {slot.status === 'ready'
                                    ? '바로 준비 가능'
                                    : slot.status === 'partial'
                                      ? '일부 데이터 보완 필요'
                                      : slot.status === 'assisted'
                                        ? '작성 보조 필요'
                                        : slot.status === 'external_required'
                                          ? '외부 수령 필요'
                                          : slot.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-[#0f1f3d]">{slot.generation_mode}</td>
                              <td className="px-3 py-2 text-xs text-[#0f1f3d]">
                                {slot.recommended_layout === 'one_page'
                                  ? '한 페이지 우선'
                                  : slot.recommended_layout === 'compact_table'
                                    ? '표 중심 요약형'
                                    : slot.recommended_layout === 'full_report'
                                      ? '리포트형'
                                      : slot.recommended_layout === 'external_attachment'
                                        ? '외부 첨부'
                                        : slot.recommended_layout}
                              </td>
                              <td className="px-3 py-2 text-xs text-[#0f1f3d]">{slot.source_systems.join(', ') || '-'}</td>
                              <td className="px-3 py-2 text-xs text-[#0f1f3d]">
                                {[...slot.required_external_documents, ...slot.preflight_warnings, ...slot.notes].slice(0, 3).join(' / ') || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                      <div className="space-y-3 rounded-xl border border-[#d8e5fb] bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-[#64748b]">회의 기본정보</p>
                            <p className="mt-1 text-xs text-[#64748b]">초안을 만든 뒤 안건과 외부 첨부를 조정하고 Word/ZIP을 생성합니다.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="secondary-btn"
                              disabled={prepareMeetingPacketMut.isPending}
                              onClick={() => { void prepareMeetingPacketDraft().catch(() => undefined) }}
                            >
                              {prepareMeetingPacketMut.isPending ? '준비 중...' : '초안 만들기'}
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              disabled={!activeMeetingPacketDraft || saveMeetingPacketMut.isPending}
                              onClick={() => {
                                if (!activeMeetingPacketDraft) return
                                void saveMeetingPacketDraft(activeMeetingPacketDraft.run_id).catch(() => undefined)
                              }}
                            >
                              {saveMeetingPacketMut.isPending ? '저장 중...' : '초안 저장'}
                            </button>
                            <button
                              type="button"
                              className="primary-btn"
                              disabled={generateMeetingPacketMut.isPending}
                              onClick={() => { void runMeetingPacketGeneration().catch(() => undefined) }}
                            >
                              {generateMeetingPacketMut.isPending ? '생성 중...' : 'Word + ZIP 생성'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          <div>
                            <label htmlFor="meeting-packet-date" className="mb-1 block text-xs font-medium text-[#64748b]">회의일</label>
                            <input id="meeting-packet-date" name="meeting_packet_date" type="date" value={meetingPacketMeetingDate} onChange={(event) => setMeetingPacketMeetingDate(event.target.value)} className="form-input" />
                          </div>
                          <div>
                            <label htmlFor="meeting-packet-time" className="mb-1 block text-xs font-medium text-[#64748b]">회의시간</label>
                            <input id="meeting-packet-time" name="meeting_packet_time" value={meetingPacketMeetingTime} onChange={(event) => setMeetingPacketMeetingTime(event.target.value)} className="form-input" placeholder="10:00" />
                          </div>
                          <div>
                            <label htmlFor="meeting-packet-method" className="mb-1 block text-xs font-medium text-[#64748b]">개최방식</label>
                            <input id="meeting-packet-method" name="meeting_packet_method" value={meetingPacketMeetingMethod} onChange={(event) => setMeetingPacketMeetingMethod(event.target.value)} className="form-input" placeholder="서면결의" />
                          </div>
                          <div className="md:col-span-2 xl:col-span-1">
                            <label htmlFor="meeting-packet-location" className="mb-1 block text-xs font-medium text-[#64748b]">장소</label>
                            <input id="meeting-packet-location" name="meeting_packet_location" value={meetingPacketLocation} onChange={(event) => setMeetingPacketLocation(event.target.value)} className="form-input" placeholder="회의실 또는 본점" />
                          </div>
                          <div>
                            <label htmlFor="meeting-packet-chair" className="mb-1 block text-xs font-medium text-[#64748b]">의장/대표</label>
                            <input id="meeting-packet-chair" name="meeting_packet_chair" value={meetingPacketChairName} onChange={(event) => setMeetingPacketChairName(event.target.value)} className="form-input" placeholder="대표이사 또는 GP" />
                          </div>
                          <div>
                            <label htmlFor="meeting-packet-docno" className="mb-1 block text-xs font-medium text-[#64748b]">문서번호</label>
                            <input id="meeting-packet-docno" name="meeting_packet_document_number" value={meetingPacketDocumentNumber} onChange={(event) => setMeetingPacketDocumentNumber(event.target.value)} className="form-input" placeholder="트리거-2026-07호" />
                          </div>
                        </div>

                        <div className="rounded-lg border border-[#d8e5fb] bg-[#f8fbff] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-[#64748b]">안건 편집</p>
                              <p className="mt-1 text-xs text-[#64748b]">의결서에는 축약 제목이 들어가므로 필요하면 짧은 제목도 같이 다듬습니다.</p>
                            </div>
                            <button type="button" className="secondary-btn" onClick={addMeetingAgendaItem}>안건 추가</button>
                          </div>
                          <div className="mt-3 space-y-3">
                            {meetingPacketAgendaItems.length === 0 ? (
                              <p className="text-sm text-[#64748b]">초안을 만들면 추천 안건이 여기에 채워집니다.</p>
                            ) : (
                              meetingPacketAgendaItems.map((item, index) => (
                                <div key={`agenda-${item.id ?? index}`} className="rounded-lg border border-[#d8e5fb] bg-white p-3">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-[#64748b]">안건 {index + 1}</span>
                                    <button type="button" className="text-xs text-red-600 hover:text-red-700" onClick={() => removeMeetingAgendaItem(index)}>삭제</button>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                      <label htmlFor={`meeting-agenda-title-${index}`} className="mb-1 block text-xs font-medium text-[#64748b]">전체 제목</label>
                                      <input id={`meeting-agenda-title-${index}`} name={`meeting_agenda_title_${index}`} value={item.title} onChange={(event) => updateMeetingAgendaItem(index, { title: event.target.value })} className="form-input" />
                                    </div>
                                    <div>
                                      <label htmlFor={`meeting-agenda-short-title-${index}`} className="mb-1 block text-xs font-medium text-[#64748b]">축약 제목</label>
                                      <input id={`meeting-agenda-short-title-${index}`} name={`meeting_agenda_short_title_${index}`} value={item.short_title || ''} onChange={(event) => updateMeetingAgendaItem(index, { short_title: event.target.value })} className="form-input" />
                                    </div>
                                    <div>
                                      <label htmlFor={`meeting-agenda-kind-${index}`} className="mb-1 block text-xs font-medium text-[#64748b]">안건 종류</label>
                                      <input id={`meeting-agenda-kind-${index}`} name={`meeting_agenda_kind_${index}`} value={item.kind} onChange={(event) => updateMeetingAgendaItem(index, { kind: event.target.value })} className="form-input" />
                                    </div>
                                    <div className="md:col-span-2">
                                      <label htmlFor={`meeting-agenda-description-${index}`} className="mb-1 block text-xs font-medium text-[#64748b]">설명문</label>
                                      <textarea id={`meeting-agenda-description-${index}`} name={`meeting_agenda_description_${index}`} value={item.description || ''} onChange={(event) => updateMeetingAgendaItem(index, { description: event.target.value })} className="form-input min-h-[96px]" />
                                    </div>
                                    <div className="md:col-span-2">
                                      <label htmlFor={`meeting-agenda-resolution-${index}`} className="mb-1 block text-xs font-medium text-[#64748b]">의사록 결의문</label>
                                      <textarea id={`meeting-agenda-resolution-${index}`} name={`meeting_agenda_resolution_${index}`} value={item.resolution_text || ''} onChange={(event) => updateMeetingAgendaItem(index, { resolution_text: event.target.value })} className="form-input min-h-[72px]" />
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-xl border border-[#d8e5fb] bg-white p-3">
                        <div>
                          <p className="text-xs font-semibold text-[#64748b]">외부 첨부 연결</p>
                          <p className="mt-1 text-xs text-[#64748b]">감사보고서나 재무제표 증명원처럼 외부에서 받은 문서를 총회 패키지 슬롯에 연결합니다.</p>
                        </div>
                        {meetingPacketExternalSlots.length === 0 ? (
                          <p className="text-sm text-[#64748b]">현재 외부 첨부가 필요한 슬롯이 없습니다.</p>
                        ) : (
                          meetingPacketExternalSlots.map((slot) => (
                            <div key={`binding-${slot.slot}`} className="block">
                              <label htmlFor={`meeting-binding-${slot.slot}`} className="mb-1 block text-xs font-medium text-[#64748b]">{slot.slot_label}</label>
                              <select
                                id={`meeting-binding-${slot.slot}`}
                                name={`meeting_binding_${slot.slot}`}
                                value={meetingPacketExternalBindings[slot.slot] ?? ''}
                                onChange={(event) =>
                                  setMeetingPacketExternalBindings((prev) => ({
                                    ...prev,
                                    [slot.slot]: event.target.value ? Number(event.target.value) : '',
                                  }))
                                }
                                className="form-input"
                              >
                                <option value="">문서 선택 안 함</option>
                                {fundLegalDocuments.map((doc) => (
                                  <option key={`${slot.slot}-${doc.id}`} value={doc.id}>
                                    {doc.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))
                        )}

                        <div className="rounded-lg border border-[#d8e5fb] bg-[#f8fbff] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-[#64748b]">생성 결과</p>
                            {activeMeetingPacketDraft?.zip_attachment_id ? (
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => {
                                  void downloadGeneratedDocument(activeMeetingPacketDraft.zip_attachment_id as number)
                                    .then((blob) => downloadBlob(blob, `${fundDetail?.name || 'meeting_packet'}.zip`))
                                    .catch(() => undefined)
                                }}
                              >
                                ZIP 다운로드
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-3 space-y-2">
                            {(activeMeetingPacketDraft?.documents || []).length === 0 ? (
                              <p className="text-sm text-[#64748b]">생성 후 문서별 다운로드 링크가 여기에 표시됩니다.</p>
                            ) : (
                              activeMeetingPacketDraft?.documents.map((doc) => (
                                <div key={`generated-doc-${doc.id}`} className="flex items-center justify-between gap-2 rounded border border-[#d8e5fb] bg-white px-3 py-2">
                                  <div>
                                    <p className="text-sm font-medium text-[#0f1f3d]">{doc.slot_label}</p>
                                    <p className="text-xs text-[#64748b]">
                                      {doc.filename || doc.external_document_name || '-'} / {doc.status} / {doc.source_mode}
                                    </p>
                                  </div>
                                  {doc.attachment_id ? (
                                    <button
                                      type="button"
                                      className="secondary-btn"
                                      onClick={() => {
                                        void downloadGeneratedDocument(doc.attachment_id as number)
                                          .then((blob) => downloadBlob(blob, doc.filename || `${doc.slot}.docx`))
                                          .catch(() => undefined)
                                      }}
                                    >
                                      다운로드
                                    </button>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="card-base">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#0f1f3d]">LP 보고서 생성</h3>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => generateLpReportMut.mutate()}
                    disabled={generateLpReportMut.isPending}
                  >
                    {generateLpReportMut.isPending ? '생성 중...' : '보고서 생성'}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-xs font-medium text-[#64748b]">연도</span>
                    <input
                      type="number"
                      min={2000}
                      max={2100}
                      className="form-input"
                      value={lpReportYear}
                      onChange={(event) => setLpReportYear(Number(event.target.value) || new Date().getFullYear())}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-[#64748b]">분기</span>
                    <select
                      className="form-input"
                      value={lpReportQuarter}
                      onChange={(event) => setLpReportQuarter(Number(event.target.value) || 1)}
                    >
                      {[1, 2, 3, 4].map((quarter) => (
                        <option key={quarter} value={quarter}>
                          {quarter}분기
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="md:col-span-2 rounded border border-[#d8e5fb] bg-[#f5f9ff] px-3 py-2 text-xs text-[#64748b]">
                    <p>투자 현황: {Array.isArray(lpReportPreview?.portfolio) ? lpReportPreview.portfolio.length : 0}건</p>
                    <p>주요 이벤트: {Array.isArray(lpReportPreview?.events) ? lpReportPreview.events.length : 0}건</p>
                    <p>
                      수익률: IRR {lpReportPreview?.performance?.irr != null ? `${(Number(lpReportPreview.performance.irr) * 100).toFixed(2)}%` : 'N/A'}
                      {' · '}
                      TVPI {lpReportPreview?.performance?.tvpi != null ? `${Number(lpReportPreview.performance.tvpi).toFixed(2)}x` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
              <FundDocumentGenerator fundId={fundId} fundName={fundDetail.name} />
            </div>
          )}

          {transferSourceLp && (
            <LPTransferModal
              fromLp={transferSourceLp}
              lps={fundDetail.lps ?? []}
              loading={createLPTransferMut.isPending}
              onSubmit={(data) => createLPTransferMut.mutate(data)}
              onCancel={() => setTransferSourceLp(null)}
            />
          )}

          {showCapCallWizard && (
            <CapitalCallWizard
              fund={fundDetail}
              lps={fundDetail.lps ?? []}
              noticePeriods={fundDetail.notice_periods ?? []}
              initialPaidIn={initialPaidInForWizard}
              onClose={() => setShowCapCallWizard(false)}
            />
          )}
        </>
      )}
    </div>
  )
}





