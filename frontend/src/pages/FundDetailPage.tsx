import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addFundFormationWorkflow,
  calculateDeadline,
  createCapitalCallBatch,
  createFundLP,
  deleteFund,
  deleteFundLP,
  fetchCapitalCalls,
  fetchCapitalCallSummary,
  fetchDocumentStatus,
  fetchFund,
  fetchInvestments,
  fetchLPAddressBooks,
  fetchWorkflows,
  fetchWorkflowInstances,
  updateFund,
  updateFundKeyTerms,
  updateFundLP,
  updateFundNoticePeriods,
  type DocumentStatusItem,
  type Fund,
  type FundInput,
  type FundKeyTermInput,
  type FundNoticePeriodInput,
  type CapitalCall,
  type CapitalCallSummary,
  type LP,
  type LPAddressBook,
  type LPInput,
  type NoticeDeadlineResult,
  type WorkflowInstance,
  type WorkflowListItem,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import PageLoading from '../components/PageLoading'

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

const NOTICE_TYPE_MAP = new Map(STANDARD_NOTICE_TYPES.map((item) => [item.notice_type, item]))

const FUND_TYPE_OPTIONS = [
  '투자조합',
  '벤처투자조합',
  '신기술투자조합',
  '사모투자합자회사(PEF)',
  '창업투자조합',
  '기타',
]

const FUND_STATUS_OPTIONS = [
  { value: 'forming', label: '결성예정' },
  { value: 'active', label: '운용 중' },
  { value: 'dissolved', label: '해산' },
  { value: 'liquidated', label: '청산 완료' },
]

const LP_TYPE_OPTIONS = ['기관투자자', '개인투자자', 'GP']

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
  type: '기관투자자',
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 bg-gray-50 rounded-xl p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-800 mt-1">{value}</p>
    </div>
  )
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

function buildLinkedWorkflowLabel(call: CapitalCall, fallbackFundName: string): string {
  const name = call.linked_workflow_name?.trim()
  if (name) return name
  return `[${fallbackFundName}] 출자요청 워크플로 진행건`
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

function FundForm({
  initial,
  loading,
  onSubmit,
  onCancel,
}: {
  initial: FundInput
  loading: boolean
  onSubmit: (data: FundInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FundInput>(initial)

  return (
    <div className="card-base space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">조합 수정</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">조합명</label>
          <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="조합명" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">조합 유형</label>
          <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg">
            {FUND_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
          <select value={form.status || 'active'} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg">
            {FUND_STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">결성일</label>
          <input type="date" value={form.formation_date || ''} onChange={e => setForm(prev => ({ ...prev, formation_date: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        {form.status !== 'forming' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">만기일</label>
            <input type="date" value={form.maturity_date || ''} onChange={e => setForm(prev => ({ ...prev, maturity_date: e.target.value || null }))} className="w-full px-3 py-2 text-sm border rounded-lg" />
          </div>
        )}
        {(form.status === 'dissolved' || form.status === 'liquidated') && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">해산일</label>
            <input type="date" value={form.dissolution_date || ''} onChange={e => setForm(prev => ({ ...prev, dissolution_date: e.target.value || null }))} className="w-full px-3 py-2 text-sm border rounded-lg" />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">GP</label>
          <input value={form.gp || ''} onChange={e => setForm(prev => ({ ...prev, gp: e.target.value }))} placeholder="GP" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">대표 펀드매니저</label>
          <input value={form.fund_manager || ''} onChange={e => setForm(prev => ({ ...prev, fund_manager: e.target.value }))} placeholder="대표 펀드매니저" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Co-GP</label>
          <input value={form.co_gp || ''} onChange={e => setForm(prev => ({ ...prev, co_gp: e.target.value }))} placeholder="Co-GP" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">신탁사</label>
          <input value={form.trustee || ''} onChange={e => setForm(prev => ({ ...prev, trustee: e.target.value }))} placeholder="신탁사" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">총 약정액</label>
          <input type="number" value={form.commitment_total ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment_total: e.target.value ? Number(e.target.value) : null }))} placeholder="총 약정액" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">GP 출자금</label>
          <input type="number" value={form.gp_commitment ?? ''} onChange={e => setForm(prev => ({ ...prev, gp_commitment: e.target.value ? Number(e.target.value) : null }))} placeholder="GP 출자금" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">출자방식</label>
          <select value={form.contribution_type || ''} onChange={e => setForm(prev => ({ ...prev, contribution_type: e.target.value || null }))} className="w-full px-3 py-2 text-sm border rounded-lg">
            <option value="">출자방식 선택</option>
            <option value="일시">일시</option>
            <option value="분할">분할</option>
            <option value="수시">수시</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">투자기간 종료일</label>
          <input type="date" value={form.investment_period_end || ''} onChange={e => setForm(prev => ({ ...prev, investment_period_end: e.target.value }))} className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">관리보수율(%)</label>
          <input type="number" step="0.01" value={form.mgmt_fee_rate ?? ''} onChange={e => setForm(prev => ({ ...prev, mgmt_fee_rate: e.target.value ? Number(e.target.value) : null }))} placeholder="관리보수율(%)" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">성과보수율(%)</label>
          <input type="number" step="0.01" value={form.performance_fee_rate ?? ''} onChange={e => setForm(prev => ({ ...prev, performance_fee_rate: e.target.value ? Number(e.target.value) : null }))} placeholder="성과보수율(%)" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">허들레이트(%)</label>
          <input type="number" step="0.01" value={form.hurdle_rate ?? ''} onChange={e => setForm(prev => ({ ...prev, hurdle_rate: e.target.value ? Number(e.target.value) : null }))} placeholder="허들레이트(%)" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">운용계좌번호</label>
          <input value={form.account_number || ''} onChange={e => setForm(prev => ({ ...prev, account_number: e.target.value }))} placeholder="운용계좌번호" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            ...form,
            name: form.name.trim(),
            type: form.type.trim(),
            status: form.status || 'active',
            formation_date: form.formation_date || null,
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
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">주소록 매핑</label>
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
                type: selected.type,
                contact: selected.contact || '',
                business_number: selected.business_number || '',
                address: selected.address || '',
              }))
            }}
            className="w-full px-2 py-1 text-sm border rounded"
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
        <div><label className="mb-1 block text-xs font-medium text-gray-600">LP 이름</label><input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="LP 이름" className="w-full px-2 py-1 text-sm border rounded" /></div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">LP 유형</label>
          <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} className="w-full px-2 py-1 text-sm border rounded">
            {LP_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">약정액</label><input type="number" value={form.commitment ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment: e.target.value ? Number(e.target.value) : null }))} placeholder="약정액" className="w-full px-2 py-1 text-sm border rounded" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">납입액</label><input type="number" value={form.paid_in ?? ''} onChange={e => setForm(prev => ({ ...prev, paid_in: e.target.value ? Number(e.target.value) : null }))} placeholder="납입액" className="w-full px-2 py-1 text-sm border rounded" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">연락처</label><input value={form.contact || ''} onChange={e => setForm(prev => ({ ...prev, contact: e.target.value }))} placeholder="연락처" className="w-full px-2 py-1 text-sm border rounded" /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-600">사업자번호/생년월일</label><input value={form.business_number || ''} onChange={e => setForm(prev => ({ ...prev, business_number: e.target.value }))} placeholder="사업자번호/생년월일" className="w-full px-2 py-1 text-sm border rounded" /></div>
        <div className="md:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-600">주소</label><input value={form.address || ''} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} placeholder="주소" className="w-full px-2 py-1 text-sm border rounded" /></div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            ...form,
            address_book_id: selectedAddressBookId ? Number(selectedAddressBookId) : (form.address_book_id ?? null),
            name: form.name.trim(),
            type: form.type.trim(),
            contact: form.contact?.trim() || null,
            business_number: form.business_number?.trim() || null,
            address: form.address?.trim() || null,
          })}
          disabled={loading || !form.name.trim() || !form.type.trim()}
          className="primary-btn"
        >
          저장
        </button>
        <button onClick={onCancel} className="px-3 py-1 text-xs bg-white border rounded hover:bg-gray-100">취소</button>
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
      queryClient.invalidateQueries({ queryKey: ['capitalCalls', { fund_id: fund.id }] })
      queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems'] })
      queryClient.invalidateQueries({ queryKey: ['fund', fund.id] })
      queryClient.invalidateQueries({ queryKey: ['fundDetails', fund.id] })
      queryClient.invalidateQueries({ queryKey: ['fundLPs', fund.id] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      queryClient.invalidateQueries({ queryKey: ['capitalCallSummary', fund.id] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
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
          <h3 className="text-base font-semibold text-gray-900">출자 요청 위저드</h3>
          <button onClick={onClose} className="secondary-btn">닫기</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">납입일</label>
              <input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">출자 유형</label>
              <select value={callType} onChange={(e) => setCallType(e.target.value as 'initial' | 'additional' | 'regular')} className="w-full rounded border px-2 py-1.5 text-sm">
                <option value="initial">최초 출자</option>
                <option value="additional">수시 출자</option>
                <option value="regular">정기 출자</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">요청 비율 (%)</label>
              <input type="number" min={0} max={remainingPercent} value={requestPercent} onChange={(e) => setRequestPercent(Number(e.target.value || 0))} className="w-full rounded border px-2 py-1.5 text-sm" />
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            <p>통지 유형: {selectedNoticePeriod.label || noticeTypeForCall}</p>
            <p>통지 기간: {noticeDays}{noticeDayBasis === 'calendar' ? '일' : '영업일'}</p>
            <p>발송 마감: {sendDeadline ? sendDeadline.toLocaleDateString('ko-KR') : '-'}</p>
            {selectedNoticePeriod.memo ? <p className="mt-1 text-xs text-blue-800">규약 메모: {selectedNoticePeriod.memo}</p> : null}
            {isBylawViolation ? <p className="mt-1 font-semibold text-red-600">규약 위반: 통지기간을 충족하지 못하는 일정입니다.</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">총 약정</p>
              <p className="text-sm font-semibold text-gray-800">{formatKRW(commitmentTotal)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">기납입</p>
              <p className="text-sm font-semibold text-gray-800">{formatKRW(existingPaidIn)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">잔여 약정</p>
              <p className="text-sm font-semibold text-emerald-700">{formatKRW(remainingCommitment)} ({remainingPercent}%)</p>
            </div>
          </div>

          <div className="max-h-60 overflow-auto rounded border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
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
                        <label className="mb-1 block text-[10px] font-medium text-gray-500">요청금액</label>
                        <input
                          type="number"
                          min={0}
                          max={row.remaining}
                          value={row.amount}
                          onChange={(e) => {
                            const amount = Math.max(0, Number(e.target.value || 0))
                            setLpAmounts((prev) => {
                              const copy = [...prev]
                              copy[idx] = { ...copy[idx], amount }
                              return copy
                            })
                          }}
                          className={`w-36 rounded border px-2 py-1 text-right text-sm ${
                            row.amount > row.remaining ? 'border-red-500 bg-red-50' : ''
                          }`}
                        />
                        <p className="mt-1 text-[10px] text-gray-500">최대 {formatKRW(row.remaining)}</p>
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
            <p className="text-sm text-gray-600">총 요청금액: <span className="font-semibold text-gray-900">{formatKRW(totalAmount)}</span></p>
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
  const [editingNotices, setEditingNotices] = useState(false)
  const [editingKeyTerms, setEditingKeyTerms] = useState(false)
  const [showCapCallWizard, setShowCapCallWizard] = useState(false)
  const [investmentViewMode, setInvestmentViewMode] = useState<'cards' | 'table'>('cards')
  const [noticeDraft, setNoticeDraft] = useState<EditableNoticePeriod[]>([])
  const [keyTermDraft, setKeyTermDraft] = useState<EditableKeyTerm[]>([])
  const [formationWorkflowTriggerDate, setFormationWorkflowTriggerDate] = useState('')
  const [formationTemplateModal, setFormationTemplateModal] = useState<{ slotKey: string; slotLabel: string } | null>(null)
  const [selectedFormationTemplateId, setSelectedFormationTemplateId] = useState<number | ''>('')

  const { data: fundDetail, isLoading } = useQuery<Fund>({
    queryKey: ['fund', fundId],
    queryFn: () => fetchFund(fundId),
    enabled: Number.isFinite(fundId) && fundId > 0,
  })
  const isFormingFund = useMemo(
    () => isFormingStatus(fundDetail?.status),
    [fundDetail?.status],
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

  const { data: missingDocs } = useQuery<DocumentStatusItem[]>({
    queryKey: ['documentStatus', { fund_id: fundId, status: 'pending' }],
    queryFn: () => fetchDocumentStatus({ fund_id: fundId, status: 'pending' }),
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

  useEffect(() => {
    if (!fundDetail) return
    if (!editingNotices) {
      setNoticeDraft(buildNoticeDraft(fundDetail))
    }
    if (!editingKeyTerms) {
      setKeyTermDraft(buildKeyTermDraft(fundDetail))
    }
  }, [fundDetail, editingNotices, editingKeyTerms])

  useEffect(() => {
    setFormationWorkflowTriggerDate('')
    setFormationTemplateModal(null)
    setSelectedFormationTemplateId('')
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

  const updateFundMut = useMutation({
    mutationFn: ({ id: targetId, data }: { id: number; data: Partial<FundInput> }) => updateFund(targetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
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
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
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
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      setEditingKeyTerms(false)
      addToast('success', '주요 계약 조항이 저장되었습니다.')
    },
  })

  const deleteFundMut = useMutation({
    mutationFn: deleteFund,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      addToast('success', '조합이 삭제되었습니다.')
      navigate('/funds')
    },
  })

  const createLPMut = useMutation({
    mutationFn: ({ data }: { data: LPInput }) => createFundLP(fundId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      setShowCreateLP(false)
      addToast('success', 'LP가 추가되었습니다.')
    },
  })

  const updateLPMut = useMutation({
    mutationFn: ({ lpId, data }: { lpId: number; data: Partial<LPInput> }) => updateFundLP(fundId, lpId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      setEditingLPId(null)
      addToast('success', 'LP가 수정되었습니다.')
    },
  })

  const deleteLPMut = useMutation({
    mutationFn: (lpId: number) => deleteFundLP(fundId, lpId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      addToast('success', 'LP가 삭제되었습니다.')
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
      queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
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

  if (!Number.isFinite(fundId) || fundId <= 0) {
    return <div className="page-container text-sm text-red-600">유효하지 않은 조합 ID입니다.</div>
  }

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/funds" className="hover:text-blue-600">조합 관리</Link>
        <span>/</span>
        <span className="text-gray-900">{fundDetail?.name ?? `조합 #${fundId}`}</span>
      </div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{fundDetail?.name ?? `조합 #${fundId}`}</h2>
          <p className="page-subtitle">조합 상세 정보와 LP/투자 현황을 관리합니다.</p>
        </div>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : !fundDetail ? (
        <p className="text-sm text-gray-500">조합을 찾을 수 없습니다.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="총 약정" value={formatKRW(fundDetail.commitment_total ?? null)} />
            <SummaryCard label="투자 건수" value={`${investments?.length ?? 0}건`} />
            <SummaryCard label="투자 금액 합계" value={formatKRW(totalInvestmentAmount)} />
          </div>

          {editingFund ? (
            <FundForm
              initial={{ ...fundDetail, formation_date: fundDetail.formation_date || '' }}
              loading={updateFundMut.isPending}
              onSubmit={data => updateFundMut.mutate({ id: fundId, data })}
              onCancel={() => setEditingFund(false)}
            />
          ) : (
            <div className="card-base space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{fundDetail.name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{fundDetail.type} | {labelStatus(fundDetail.status)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingFund(true)} className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1"><Pencil size={12} />수정</button>
                  <button onClick={() => { if (confirm('이 조합을 삭제하시겠습니까?')) deleteFundMut.mutate(fundId) }} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 flex items-center gap-1"><Trash2 size={12} />삭제</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="p-2 bg-gray-50 rounded">결성일: {fundDetail.formation_date || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">투자기간 종료일: {fundDetail.investment_period_end || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">만기일: {fundDetail.maturity_date || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">GP: {fundDetail.gp || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">대표 펀드매니저: {fundDetail.fund_manager || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">Co-GP: {fundDetail.co_gp || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">신탁사: {fundDetail.trustee || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">약정액: {formatKRW(fundDetail.commitment_total ?? null)}</div>
                <div className="p-2 bg-gray-50 rounded">GP 출자금: {formatKRW(fundDetail.gp_commitment ?? null)}</div>
                <div className="p-2 bg-gray-50 rounded">출자방식: {fundDetail.contribution_type || '-'}</div>
                <div className="p-2 bg-gray-50 rounded">관리보수율: {fundDetail.mgmt_fee_rate != null ? `${fundDetail.mgmt_fee_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded">성과보수율: {fundDetail.performance_fee_rate != null ? `${fundDetail.performance_fee_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded">허들레이트: {fundDetail.hurdle_rate != null ? `${fundDetail.hurdle_rate}%` : '-'}</div>
                <div className="p-2 bg-gray-50 rounded md:col-span-3">운용계좌번호: {fundDetail.account_number || '-'}</div>
              </div>
            </div>
          )}

          {isFormingFund && (
            <div className="card-base space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">결성 진행 컨트롤 패널</h3>
                  <p className="text-xs text-gray-500">필요한 결성 워크플로를 개별로 추가하세요.</p>
                </div>
                <div className="w-full md:w-56">
                  <label className="mb-1 block text-xs font-medium text-gray-600">기준일</label>
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
                          ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed'
                          : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
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
                <h3 className="text-base font-semibold text-gray-900">템플릿 선택</h3>
                <p className="mt-1 text-sm text-gray-600">
                  [{formationTemplateModal.slotLabel}]에 매핑할 템플릿을 선택하세요.
                </p>

                <div className="mt-4 space-y-1">
                  <label className="block text-xs font-medium text-gray-600">워크플로 템플릿</label>
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
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
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

          <div className="card-base">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-700">출자 이력</h3>
              <button onClick={() => setShowCapCallWizard(true)} className="primary-btn">출자요청 위저드</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">차수</th>
                    <th className="px-3 py-2 text-left">납입일</th>
                    <th className="px-3 py-2 text-right">납입금액</th>
                    <th className="px-3 py-2 text-right">납입비율</th>
                    <th className="px-3 py-2 text-left">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-3 py-2">최초 결성</td>
                    <td className="px-3 py-2">{fundDetail.formation_date || '-'}</td>
                    <td className="px-3 py-2 text-right">{formatKRW(initialPaidIn)}</td>
                    <td className="px-3 py-2 text-right">
                      {fundDetail.commitment_total ? `${((initialPaidIn / fundDetail.commitment_total) * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-500">최초 납입</td>
                  </tr>
                  {splitCapitalCalls.nonInitial.map((call, index) => (
                    <tr key={call.id}>
                      <td className="px-3 py-2">{index + 1}차 캐피탈콜</td>
                      <td className="px-3 py-2">{call.call_date || '-'}</td>
                      <td className="px-3 py-2 text-right">{formatKRW(callPaidAmountById.get(call.id) ?? Number(call.total_amount || 0))}</td>
                      <td className="px-3 py-2 text-right">
                        {fundDetail.commitment_total
                          ? `${(((callPaidAmountById.get(call.id) ?? Number(call.total_amount || 0)) / fundDetail.commitment_total) * 100).toFixed(1)}%`
                          : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{call.memo || call.call_type || '-'}</span>
                          {call.linked_workflow_instance_id ? (
                            <button
                              type="button"
                              onClick={() => navigate('/workflows', { state: { expandInstanceId: call.linked_workflow_instance_id } })}
                              className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                            >
                              {buildLinkedWorkflowLabel(call, fundDetail.name)}
                              {call.linked_workflow_status
                                ? ` · ${WORKFLOW_STATUS_LABEL[call.linked_workflow_status] || call.linked_workflow_status}`
                                : ''}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2" colSpan={2}>합계</td>
                    <td className="px-3 py-2 text-right">{formatKRW(historyTotalPaidIn)}</td>
                    <td className="px-3 py-2 text-right">
                      {fundDetail.commitment_total ? `${((historyTotalPaidIn / fundDetail.commitment_total) * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-base space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">통지기간</h3>
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
                <p className="text-sm text-gray-400">등록된 통지기간이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {(fundDetail.notice_periods ?? []).map((row) => (
                    <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm border border-gray-200 rounded-lg p-2">
                      <div className="md:col-span-4 font-medium text-gray-800">{row.label}</div>
                      <div className="md:col-span-2 text-gray-700">
                        {row.business_days}{row.day_basis === 'calendar' ? '일' : '영업일'}
                      </div>
                      <div className="md:col-span-2 text-gray-500">
                        {row.day_basis === 'calendar' ? '일반일' : '영업일'}
                      </div>
                      <div className="md:col-span-4 text-gray-500">{row.memo || '-'}</div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-2">
                <datalist id="notice-type-options">
                  {STANDARD_NOTICE_TYPES.map((item) => (
                    <option key={item.notice_type} value={item.notice_type}>{item.label}</option>
                  ))}
                </datalist>

                {noticeDraft.map((row, idx) => (
                  <div key={row._row_id} className="grid grid-cols-1 md:grid-cols-14 gap-2 border border-gray-200 rounded-lg p-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">통지 유형</label>
                      <input
                        value={row.notice_type}
                        onChange={(e) => {
                          const nextType = e.target.value
                          const standard = NOTICE_TYPE_MAP.get(nextType)
                          setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? {
                            ...item,
                            notice_type: nextType,
                            label: item.label || standard?.label || '',
                            business_days: Number.isFinite(item.business_days) ? item.business_days : (standard?.default_days ?? 0),
                            day_basis: item.day_basis === 'calendar' ? 'calendar' : 'business',
                          } : item))
                        }}
                        list="notice-type-options"
                        placeholder="notice_type"
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">표시명</label>
                      <input
                        value={row.label}
                        onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, label: e.target.value } : item))}
                        placeholder="표시명"
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">통지일수</label>
                      <input
                        type="number"
                        min={0}
                        value={row.business_days}
                        onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, business_days: Math.max(0, Number(e.target.value || 0)) } : item))}
                        placeholder="통지일수"
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">기준</label>
                      <select
                        value={row.day_basis === 'calendar' ? 'calendar' : 'business'}
                        onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, day_basis: e.target.value as 'business' | 'calendar' } : item))}
                        className="w-full px-2 py-1 text-sm border rounded"
                      >
                        <option value="business">영업일</option>
                        <option value="calendar">일반일</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">메모/조항</label>
                      <input
                        value={row.memo || ''}
                        onChange={(e) => setNoticeDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, memo: e.target.value } : item))}
                        placeholder="메모 / 조항"
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <button
                      onClick={() => setNoticeDraft((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))}
                      className="md:col-span-1 px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => setNoticeDraft((prev) => [...prev, {
                    _row_id: `notice-new-${Date.now()}-${prev.length}`,
                    notice_type: '',
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
              <h3 className="text-sm font-semibold text-gray-700">주요 계약 조항</h3>
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
                <p className="text-sm text-gray-400">등록된 계약 조항이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {keyTermsByCategory.map(([category, rows]) => (
                    <div key={category} className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2">[{category}]</p>
                      <div className="space-y-2">
                        {rows.map((row, idx) => (
                          <div key={`${category}-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 text-sm">
                            <div className="md:col-span-3 font-medium text-gray-800">{row.label}</div>
                            <div className="md:col-span-7 text-gray-700">{row.value}</div>
                            <div className="md:col-span-2 text-gray-500">{row.article_ref || '-'}</div>
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
                  <div key={row._row_id} className="grid grid-cols-1 md:grid-cols-14 gap-2 border border-gray-200 rounded-lg p-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">카테고리</label>
                      <input
                        value={row.category}
                        onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, category: e.target.value } : item))}
                        placeholder="카테고리"
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">조항</label>
                      <input
                        value={row.label}
                        onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, label: e.target.value } : item))}
                        placeholder="조항"
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <div className="md:col-span-5">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">내용</label>
                      <input
                        value={row.value}
                        onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, value: e.target.value } : item))}
                        placeholder="내용"
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">조문</label>
                      <input
                        value={row.article_ref || ''}
                        onChange={(e) => setKeyTermDraft((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, article_ref: e.target.value } : item))}
                        placeholder="조문"
                        className="w-full px-2 py-1 text-sm border rounded"
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
                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
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
                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
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

          <div className="card-base">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">LP 목록</h3>
              <button onClick={() => setShowCreateLP(v => !v)} className="primary-btn inline-flex items-center gap-1"><Plus size={12} /> LP 추가</button>
            </div>

            {showCreateLP && (
              <div className="mb-2">
                <LPForm
                  initial={EMPTY_LP}
                  addressBooks={lpAddressBooks}
                  loading={createLPMut.isPending}
                  onSubmit={data => createLPMut.mutate({ data })}
                  onCancel={() => setShowCreateLP(false)}
                />
              </div>
            )}

            <div className="space-y-2">
              {fundDetail.lps?.length ? fundDetail.lps.map((lp) => (
                <div key={lp.id} className="border border-gray-200 rounded-lg p-3">
                  {editingLPId === lp.id ? (
                    <LPForm
                      initial={lp}
                      addressBooks={lpAddressBooks}
                      loading={updateLPMut.isPending}
                      onSubmit={data => updateLPMut.mutate({ lpId: lp.id, data })}
                      onCancel={() => setEditingLPId(null)}
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{lp.name}</p>
                          <p className="text-xs text-gray-500">{lp.type} | 연락처: {lp.contact || '-'}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingLPId(lp.id)} className="secondary-btn">수정</button>
                          <button onClick={() => { if (confirm('이 LP를 삭제하시겠습니까?')) deleteLPMut.mutate(lp.id) }} className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">삭제</button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">약정액: {formatKRW(lp.commitment ?? null)} | 납입액: {formatKRW(lp.paid_in ?? null)}</p>
                    </>
                  )}
                </div>
              )) : <p className="text-sm text-gray-400">등록된 LP가 없습니다.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card-base">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">투자 내역</h3>
                <div className="flex rounded border text-xs">
                  <button
                    onClick={() => setInvestmentViewMode('cards')}
                    className={`px-2 py-1 ${investmentViewMode === 'cards' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
                  >
                    카드
                  </button>
                  <button
                    onClick={() => setInvestmentViewMode('table')}
                    className={`px-2 py-1 ${investmentViewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
                  >
                    목록
                  </button>
                </div>
              </div>

              {!investments?.length ? (
                <p className="text-sm text-gray-400">등록된 투자가 없습니다.</p>
              ) : investmentViewMode === 'cards' ? (
                <div className="space-y-2">
                  {investments.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => navigate(`/investments/${inv.id}`)}
                      className="w-full rounded-xl border border-gray-100 p-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">{inv.company_name || `투자 #${inv.id}`}</span>
                        <ChevronRight size={16} className="text-gray-400" />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
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
                    <thead className="bg-gray-50 text-xs text-gray-500">
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
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => navigate(`/investments/${inv.id}`)}
                        >
                          <td className="px-3 py-2 font-medium text-gray-800">{inv.company_name || '-'}</td>
                          <td className="px-3 py-2 text-gray-500">{inv.company_founded_date || '-'}</td>
                          <td className="px-3 py-2 text-gray-500">{inv.industry || '-'}</td>
                          <td className="px-3 py-2 text-gray-700">{inv.instrument || '-'}</td>
                          <td className="px-3 py-2 text-right">{formatKRW(inv.amount ?? null)}</td>
                          <td className="px-3 py-2 text-center">{inv.status === 'exited' ? 'Y' : '-'}</td>
                          <td className="px-3 py-2 text-gray-500">{inv.investment_date || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card-base">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">미수 서류</h3>
              {!missingDocs?.length ? (
                <p className="text-sm text-gray-400">미수 서류가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {missingDocs.map((doc) => (
                    <div key={doc.id} className="border border-gray-100 rounded p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{doc.document_name}</p>
                        {dueText(doc) && (
                          <span className={`${doc.days_remaining != null && doc.days_remaining < 0 ? 'tag tag-red' : 'tag tag-amber'}`}>
                            {dueText(doc)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{doc.company_name} | {doc.note || '-'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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
