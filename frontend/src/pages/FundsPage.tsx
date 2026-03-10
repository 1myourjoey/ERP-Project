import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  createFund,
  createFundLP,
  createGPEntity,
  downloadFundMigrationTemplate,
  fetchFunds,
  fetchGPEntities,
  fetchLPAddressBooks,
  importFundMigration,
  updateGPEntity,
  validateFundMigration,
  type Fund,
  type FundInput,
  type FundMigrationImportResponse,
  type FundMigrationValidateResponse,
  type GPEntity,
  type GPEntityInput,
  type LPAddressBook,
  type LPInput,
} from '../lib/api'
import { formatKRWFull, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Plus, X } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import FundCoreFields from '../components/funds/FundCoreFields'
import KrwAmountInput from '../components/common/KrwAmountInput'
import { FUND_TYPE_OPTIONS } from '../lib/fundOptions'
import { DEFAULT_LP_TYPE, isGpLpType, LP_TYPE_SELECT_GROUPS, normalizeLpTypeOrFallback } from '../lib/lpTypes'
import { invalidateFundRelated } from '../lib/queryInvalidation'

const ENTITY_TYPE_LABEL: Record<string, string> = {
  vc: '창업투자회사 (VC)',
  llc_vc: '유한회사형 창업투자회사',
  nksa: '신기술사업금융전문회사 (신기사)',
  other: '기타 운용사',
}

const ENTITY_TYPE_OPTIONS: Array<{ value: GPEntityInput['entity_type']; label: string }> = [
  { value: 'vc', label: ENTITY_TYPE_LABEL.vc },
  { value: 'llc_vc', label: ENTITY_TYPE_LABEL.llc_vc },
  { value: 'nksa', label: ENTITY_TYPE_LABEL.nksa },
  { value: 'other', label: ENTITY_TYPE_LABEL.other },
]

const EMPTY_FUND: FundInput = {
  name: '',
  type: FUND_TYPE_OPTIONS[0],
  formation_date: '',
  registration_number: '',
  registration_date: '',
  status: 'active',
  gp_entity_id: null,
  gp: '',
  fund_manager: '',
  co_gp: '',
  trustee: '',
  commitment_total: null,
  gp_commitment: null,
  contribution_type: '',
  investment_period_end: '',
  maturity_date: '',
  dissolution_date: '',
  mgmt_fee_rate: null,
  performance_fee_rate: null,
  hurdle_rate: null,
  account_number: '',
}

type LPDraft = LPInput & {
  _id: string
  _gpAutoFilled?: boolean
  _addressBookId?: string
}

function fileSignature(file: File | null): string {
  if (!file) return ''
  return `${file.name}::${file.size}::${file.lastModified}`
}

function createDraftId() {
  return `lp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createEmptyLpDraft(): LPDraft {
  return {
    _id: createDraftId(),
    name: '',
    type: DEFAULT_LP_TYPE,
    commitment: null,
    paid_in: null,
    contact: '',
    business_number: '',
    address: '',
    _gpAutoFilled: false,
    _addressBookId: '',
  }
}

function normalizeFundPayload(form: FundInput): FundInput {
  return {
    ...form,
    name: (form.name || '').trim(),
    type: (form.type || FUND_TYPE_OPTIONS[0]).trim(),
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
    commitment_total: form.commitment_total ?? null,
    gp_commitment: form.gp_commitment ?? null,
    gp_commitment_amount: form.gp_commitment ?? null,
    contribution_type: form.contribution_type?.trim() || null,
    mgmt_fee_rate: form.mgmt_fee_rate ?? null,
    performance_fee_rate: form.performance_fee_rate ?? null,
    hurdle_rate: form.hurdle_rate ?? null,
    account_number: form.account_number?.trim() || null,
  }
}

function normalizeLpPayload(rows: LPDraft[]): LPInput[] {
  return rows
    .map((lp) => ({
      name: lp.name.trim(),
      type: normalizeLpTypeOrFallback(lp.type, DEFAULT_LP_TYPE),
      commitment: lp.commitment ?? null,
      paid_in: lp.paid_in ?? null,
      contact: lp.contact?.trim() || null,
      business_number: lp.business_number?.trim() || null,
      address: lp.address?.trim() || null,
    }))
    .filter((lp) => lp.name)
}

function fundDateInfo(fund: Fund): { label: string; date: string } {
  if (fund.status === 'forming') {
    return { label: '결성예정', date: fund.formation_date || '-' }
  }

  if (fund.status === 'active') {
    if (fund.formation_date) {
      const formationDate = new Date(fund.formation_date)
      const formationText = formationDate.toLocaleDateString('ko-KR')
      const days = Math.max(0, Math.floor((Date.now() - formationDate.getTime()) / 86400000))
      return { label: '결성일', date: `${formationText} (${days}일째)` }
    }
    return { label: '결성일', date: '미등록' }
  }

  const dissolvedDate = (fund as Fund & { dissolution_date?: string | null }).dissolution_date
  return { label: '해산/청산 완료', date: fund.maturity_date || dissolvedDate || '-' }
}

function GPEntityForm({
  initial,
  loading,
  onSubmit,
  onCancel,
}: {
  initial: GPEntityInput
  loading: boolean
  onSubmit: (data: GPEntityInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<GPEntityInput>(initial)

  return (
    <div className="card-base mb-4 space-y-3 border-l-4 border-l-blue-500">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[#0f1f3d]">고유계정 등록/수정</h3>
        <button onClick={onCancel} className="text-[#64748b] hover:text-[#64748b]">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">법인명</label>
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">법인유형</label>
          <select
            value={form.entity_type}
            onChange={(e) => setForm((prev) => ({ ...prev, entity_type: e.target.value as GPEntityInput['entity_type'] }))}
            className="form-input"
          >
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">사업자등록번호</label>
          <input
            value={form.business_number || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, business_number: e.target.value }))}
            className="form-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">대표자</label>
          <input
            value={form.representative || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, representative: e.target.value }))}
            className="form-input"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-[#64748b]">주소</label>
          <input
            value={form.address || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            className="form-input"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSubmit({
              ...form,
              name: form.name.trim(),
              business_number: form.business_number?.trim() || null,
              representative: form.representative?.trim() || null,
              address: form.address?.trim() || null,
            })
          }
          disabled={loading || !form.name.trim()}
          className="primary-btn"
        >
          저장
        </button>
        <button onClick={onCancel} className="secondary-btn">
          취소
        </button>
      </div>
    </div>
  )
}

function FundForm({
  title,
  initial,
  gpEntities,
  addressBooks,
  loading,
  onSubmit,
  onCancel,
}: {
  title: string
  initial: FundInput
  gpEntities: GPEntity[]
  addressBooks: LPAddressBook[]
  loading: boolean
  onSubmit: (data: { fund: FundInput; lps: LPInput[] }) => void
  onCancel: () => void
}) {
  const { addToast } = useToast()
  const [form, setForm] = useState<FundInput>(initial)
  const [lps, setLps] = useState<LPDraft[]>([])

  const updateLp = (draftId: string, key: keyof LPDraft, value: string | number | null) => {
    setLps((prev) => prev.map((lp) => (lp._id === draftId ? { ...lp, [key]: value } : lp)))
  }

  const handleLpTypeChange = (draftId: string, nextType: string) => {
    const canonicalType = normalizeLpTypeOrFallback(nextType, DEFAULT_LP_TYPE)
    const selectedGpName = (form.gp || '').trim()
    const matchedGp =
      gpEntities.find((entity) => entity.id === (form.gp_entity_id ?? null)) ||
      gpEntities.find((entity) => entity.name === selectedGpName) ||
      null

    setLps((prev) =>
      prev.map((lp) => {
        if (lp._id !== draftId) return lp
        const next = { ...lp, type: canonicalType }
        if (!isGpLpType(canonicalType)) return next
        if (lp._gpAutoFilled) return next
        if (!matchedGp) return next
        return {
          ...next,
          name: matchedGp.name || lp.name,
          business_number: matchedGp.business_number || lp.business_number,
          address: matchedGp.address || lp.address,
          _gpAutoFilled: true,
        }
      }),
    )

    if (isGpLpType(canonicalType) && !matchedGp) {
      addToast('info', '선택된 GP 고유계정 정보가 없어 자동입력을 건너뜁니다.')
    }
  }

  const applyAddressBook = (draftId: string, addressBookId: string) => {
    if (!addressBookId) return
    const selected = addressBooks.find((row) => String(row.id) === addressBookId)
    if (!selected) return

    setLps((prev) =>
      prev.map((lp) =>
        lp._id === draftId
          ? {
              ...lp,
              _addressBookId: addressBookId,
              name: selected.name,
              type: normalizeLpTypeOrFallback(selected.type, DEFAULT_LP_TYPE),
              contact: selected.contact || '',
              business_number: selected.business_number || '',
              address: selected.address || '',
            }
          : lp,
      ),
    )
  }

  return (
    <div className="card-base space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[#0f1f3d]">{title}</h3>
        <button onClick={onCancel} className="text-[#64748b] hover:text-[#64748b]">
          <X size={18} />
        </button>
      </div>

      <FundCoreFields form={form} onChange={setForm} gpEntities={gpEntities} />

      <div className="border-t pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-[#0f1f3d]">LP 목록 (선택)</h4>
          <button onClick={() => setLps((prev) => [...prev, createEmptyLpDraft()])} className="text-xs text-[#558ef8] hover:underline">
            + LP 추가
          </button>
        </div>
        {!lps.length ? (
          <p className="text-xs text-[#64748b]">등록할 LP가 있으면 추가하세요.</p>
        ) : (
          <div className="space-y-2">
            {lps.map((lp) => (
              <div key={lp._id} className="rounded-lg border border-[#d8e5fb] p-2">
                <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[2fr_1.2fr_1.6fr_1.6fr_1.4fr_1.6fr_1.4fr]">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#64748b]">주소록에서 선택</label>
                    <select
                      value={lp._addressBookId || ''}
                      onChange={(e) => applyAddressBook(lp._id, e.target.value)}
                      className="w-full rounded border px-2 py-1.5 text-sm"
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
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#64748b]">LP명</label>
                    <input
                      value={lp.name}
                      onChange={(e) => updateLp(lp._id, 'name', e.target.value)}
                      placeholder="LP명"
                      className="w-full rounded border px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#64748b]">LP 유형</label>
                    <select
                      value={lp.type}
                      onChange={(e) => handleLpTypeChange(lp._id, e.target.value)}
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
                    <label className="mb-1 block text-[10px] font-medium text-[#64748b]">약정금액</label>
                    <KrwAmountInput
                      value={lp.commitment ?? null}
                      onChange={(next) => updateLp(lp._id, 'commitment', next)}
                      placeholder="약정금액"
                      className="w-full rounded border px-2 py-1.5 text-sm"
                      helperClassName="mt-1 text-[10px] text-[#64748b]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#64748b]">최초 납입금액</label>
                    <KrwAmountInput
                      value={lp.paid_in ?? null}
                      onChange={(next) => updateLp(lp._id, 'paid_in', next)}
                      placeholder="최초 납입금액"
                      className="w-full rounded border px-2 py-1.5 text-sm"
                      helperClassName="mt-1 text-[10px] text-[#64748b]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#64748b]">사업자등록번호/생년월일</label>
                    <input
                      value={lp.business_number ?? ''}
                      onChange={(e) => updateLp(lp._id, 'business_number', e.target.value)}
                      placeholder="사업자등록번호/생년월일"
                      className="w-full rounded border px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#64748b]">주소</label>
                    <input
                      value={lp.address ?? ''}
                      onChange={(e) => updateLp(lp._id, 'address', e.target.value)}
                      placeholder="주소"
                      className="w-full rounded border px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-[#64748b]">
                    {isGpLpType(lp.type)
                      ? '업무집행조합원(GP)은 최초 1회 GP 정보 자동입력 후, 주소록 선택으로 덮어쓸 수 있습니다.'
                      : '주소록 선택 시 LP 입력값을 즉시 채웁니다.'}
                  </p>
                  <button
                    onClick={() => setLps((prev) => prev.filter((row) => row._id !== lp._id))}
                    className="rounded border border-[#d8e5fb] px-2 py-1 text-xs text-[#64748b] hover:bg-[#f5f9ff]"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() =>
            onSubmit({
              fund: normalizeFundPayload(form),
              lps: normalizeLpPayload(lps),
            })
          }
          disabled={loading || !(form.name || '').trim()}
          className="primary-btn"
        >
          저장
        </button>
        <button onClick={onCancel} className="secondary-btn">
          취소
        </button>
      </div>
    </div>
  )
}

export default function FundsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [showCreateFund, setShowCreateFund] = useState(false)
  const [showGPEdit, setShowGPEdit] = useState(false)
  const [migrationFile, setMigrationFile] = useState<File | null>(null)
  const [migrationMode, setMigrationMode] = useState<'insert' | 'upsert'>('upsert')
  const [syncAddressBook, setSyncAddressBook] = useState(true)
  const [migrationValidation, setMigrationValidation] = useState<FundMigrationValidateResponse | null>(null)
  const [validatedSignature, setValidatedSignature] = useState('')

  const { data: funds, isLoading } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({ queryKey: ['gpEntities'], queryFn: fetchGPEntities })
  const { data: lpAddressBooks = [] } = useQuery<LPAddressBook[]>({
    queryKey: ['lpAddressBooks', { is_active: 1 }],
    queryFn: () => fetchLPAddressBooks({ is_active: 1 }),
  })

  const currentFileSignature = fileSignature(migrationFile)
  const primaryGpCandidates = gpEntities.filter((entity) => entity.is_primary === 1)
  const migrationPrimaryGp = primaryGpCandidates.length === 1 ? primaryGpCandidates[0] : null
  const migrationPrimaryGpIssue =
    primaryGpCandidates.length === 0
      ? '대표 GP 법인이 없습니다. 고유계정에서 대표 GP를 먼저 등록하세요.'
      : primaryGpCandidates.length > 1
        ? '대표 GP 법인이 여러 개입니다. 고유계정에서 대표 GP를 1개만 남겨주세요.'
        : null
  const canValidateMigration = !!migrationFile && !migrationPrimaryGpIssue
  const canImportMigration = !!(
    migrationFile &&
    migrationPrimaryGp &&
    migrationValidation &&
    migrationValidation.success &&
    migrationValidation.errors.length === 0 &&
    validatedSignature &&
    validatedSignature === currentFileSignature
  )

  const primaryGp = gpEntities.find((entity) => entity.is_primary === 1) || gpEntities[0] || null
  const createFundInitial = useMemo(
    () => ({
      ...EMPTY_FUND,
      gp_entity_id: primaryGp?.id ?? null,
      gp: primaryGp?.name ?? '',
    }),
    [primaryGp],
  )

  const createFundMut = useMutation({
    mutationFn: async ({ fund, lps }: { fund: FundInput; lps: LPInput[] }) => {
      const created = await createFund(fund)
      const normalizedGpName = (fund.gp || '').trim()
      const lpsToCreate = lps.filter((lp) => {
        const lpName = (lp.name || '').trim()
        if (!normalizedGpName) return true
        return !(isGpLpType(lp.type) && lpName === normalizedGpName)
      })
      for (const lp of lpsToCreate) {
        if (lp.name.trim()) {
          await createFundLP(created.id, lp)
        }
      }
      return created
    },
    onSuccess: (created: Fund) => {
      invalidateFundRelated(queryClient, created.id)
      setShowCreateFund(false)
      addToast('success', '조합이 생성되었습니다.')
      navigate(`/funds/${created.id}`)
    },
  })

  const createGPEntityMut = useMutation({
    mutationFn: createGPEntity,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gpEntities'] })
      setShowGPEdit(false)
      addToast('success', '고유계정을 등록했습니다.')
    },
  })

  const updateGPEntityMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<GPEntityInput> }) => updateGPEntity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gpEntities'] })
      setShowGPEdit(false)
      addToast('success', '고유계정을 수정했습니다.')
    },
  })

  const downloadTemplateMut = useMutation({
    mutationFn: downloadFundMigrationTemplate,
    onSuccess: (blob: Blob) => {
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = '조합_마이그레이션_템플릿.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    },
  })

  const validateMigrationMut = useMutation({
    mutationFn: (file: File) => validateFundMigration(file),
    onSuccess: (result) => {
      setMigrationValidation(result)
      setValidatedSignature(currentFileSignature)
      if (result.errors.length === 0) {
        addToast('success', '마이그레이션 사전 검증이 완료되었습니다.')
      } else {
        addToast('info', `검증 오류 ${result.errors.length}건을 확인하세요.`)
      }
    },
  })

  const importMigrationMut = useMutation({
    mutationFn: ({ file, mode, sync }: { file: File; mode: 'insert' | 'upsert'; sync: boolean }) =>
      importFundMigration(file, mode, sync),
    onSuccess: (result: FundMigrationImportResponse) => {
      setMigrationValidation(result.validation)
      setValidatedSignature(currentFileSignature)
      if (!result.success) {
        addToast('error', `Import 실패: 오류 ${result.errors.length}건`)
        return
      }
      invalidateFundRelated(queryClient)
      addToast(
        'success',
        `Import 완료 (조합 ${result.created_funds + result.updated_funds}건, 고유 LP ${result.created_lps + result.updated_lps}건, 납입회차 ${result.created_contributions}행)`,
      )
    },
  })

  return (
    <div className="page-container">
      <PageHeader
        title="조합 관리"
        subtitle="조합 생성, GP 정보, 마이그레이션, LP 초안을 같은 운영 문법으로 관리합니다."
        actions={
          <button onClick={() => setShowCreateFund((v) => !v)} className="primary-btn inline-flex items-center gap-1">
            <Plus size={14} /> 조합 추가
          </button>
        }
      />

      <PageMetricStrip
        items={[
          { label: '전체 조합', value: `${funds?.length ?? 0}개`, hint: '현재 등록 수', tone: 'info' },
          { label: '운용 중', value: `${funds?.filter((fund) => fund.status === 'active').length ?? 0}개`, hint: '활성 상태', tone: 'default' },
          { label: '결성 예정', value: `${funds?.filter((fund) => fund.status === 'forming').length ?? 0}개`, hint: '후속 결성 필요', tone: 'warning' },
          { label: '대표 GP', value: primaryGp?.name || '미등록', hint: primaryGp?.business_number || '고유계정 설정 필요', tone: primaryGp ? 'success' : 'danger' },
        ]}
        className="mb-4"
      />

      <div className="card-base mb-4 border-l-4 border-l-blue-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#558ef8]">고유계정 (GP 법인)</p>
            <h3 className="text-lg font-semibold text-[#0f1f3d]">{primaryGp?.name || '미등록'}</h3>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-[#64748b]">
              <span>{ENTITY_TYPE_LABEL[primaryGp?.entity_type || ''] || '-'}</span>
              <span>{primaryGp?.business_number || '-'}</span>
              <span>{primaryGp?.representative || '-'}</span>
            </div>
          </div>
          <button onClick={() => setShowGPEdit(true)} className="secondary-btn">
            {primaryGp ? '수정' : '등록'}
          </button>
        </div>
      </div>

      {showGPEdit && (
        <GPEntityForm
          initial={
            primaryGp
              ? {
                  name: primaryGp.name,
                  entity_type: primaryGp.entity_type,
                  business_number: primaryGp.business_number,
                  registration_number: primaryGp.registration_number,
                  representative: primaryGp.representative,
                  address: primaryGp.address,
                  phone: primaryGp.phone,
                  email: primaryGp.email,
                  founding_date: primaryGp.founding_date,
                  license_date: primaryGp.license_date,
                  capital: primaryGp.capital,
                  notes: primaryGp.notes,
                  is_primary: primaryGp.is_primary,
                }
              : {
                  name: '',
                  entity_type: 'vc',
                  business_number: '',
                  representative: '',
                  address: '',
                  is_primary: 1,
                }
          }
          loading={createGPEntityMut.isPending || updateGPEntityMut.isPending}
          onSubmit={(data) => {
            if (primaryGp) {
              updateGPEntityMut.mutate({ id: primaryGp.id, data })
            } else {
              createGPEntityMut.mutate(data)
            }
          }}
          onCancel={() => setShowGPEdit(false)}
        />
      )}

      {showCreateFund && (
        <div className="mb-4">
          <FundForm
            title="조합 생성"
            initial={createFundInitial}
            gpEntities={gpEntities}
            addressBooks={lpAddressBooks}
            loading={createFundMut.isPending}
            onSubmit={(data) => createFundMut.mutate(data)}
            onCancel={() => setShowCreateFund(false)}
          />
        </div>
      )}

      <div className="card-base mb-4 space-y-3 border-l-4 border-l-indigo-500">
        <div>
          <p className="text-xs font-medium text-indigo-600">조합/LP 마이그레이션</p>
          <h3 className="text-base font-semibold text-[#0f1f3d]">초기 세팅용 엑셀 Import</h3>
          <p className="mt-1 text-xs text-[#64748b]">
            `조합` + `조합원(LP)` 2개 시트로 조합, 고유 LP, 납입회차를 함께 초기 세팅합니다. 대표 GP는 엑셀에 적지 않고 고유계정의 대표 GP 법인에 자동 연결됩니다.
          </p>
        </div>
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            migrationPrimaryGp
              ? 'border-[#b6e0d1] bg-[#eefbf5] text-[#0f766e]'
              : 'border-[#f0b6b6] bg-[#fff5f5] text-[#b42318]'
          }`}
        >
          {migrationPrimaryGp
            ? `이번 import는 대표 GP ${migrationPrimaryGp.name}에 자동 연결됩니다.`
            : migrationPrimaryGpIssue}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => downloadTemplateMut.mutate()} disabled={downloadTemplateMut.isPending} className="secondary-btn">
            {downloadTemplateMut.isPending ? '다운로드 중...' : '템플릿 다운로드'}
          </button>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              const next = e.target.files?.[0] || null
              setMigrationFile(next)
              setMigrationValidation(null)
              setValidatedSignature('')
            }}
            className="text-sm"
          />
          <select
            value={migrationMode}
            onChange={(e) => setMigrationMode(e.target.value as 'insert' | 'upsert')}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="upsert">upsert</option>
            <option value="insert">insert</option>
          </select>
          <label className="inline-flex items-center gap-1 text-xs text-[#64748b]">
            <input type="checkbox" checked={syncAddressBook} onChange={(e) => setSyncAddressBook(e.target.checked)} />
            LP 주소록 동시 반영
          </label>
          <button
            onClick={() => {
              if (!migrationFile || !canValidateMigration) return
              validateMigrationMut.mutate(migrationFile)
            }}
            disabled={!canValidateMigration || validateMigrationMut.isPending}
            className="primary-btn"
          >
            {validateMigrationMut.isPending ? '검증 중...' : '검증'}
          </button>
          <button
            onClick={() => {
              if (!migrationFile || !canImportMigration) return
              importMigrationMut.mutate({ file: migrationFile, mode: migrationMode, sync: syncAddressBook })
            }}
            disabled={!canImportMigration || importMigrationMut.isPending}
            className="primary-btn"
          >
            {importMigrationMut.isPending ? 'Import 중...' : 'Import'}
          </button>
        </div>
        {migrationFile && validatedSignature && validatedSignature !== currentFileSignature && (
          <p className="text-xs text-amber-600">파일이 변경되었습니다. Import 전에 다시 검증하세요.</p>
        )}

        {migrationValidation && (
          <div className="rounded-lg border border-[#d8e5fb] bg-[#f5f9ff] p-3 text-sm">
            <p className="font-medium text-[#0f1f3d]">
              검증 결과: {migrationValidation.errors.length === 0 ? '통과' : `오류 ${migrationValidation.errors.length}건`}
            </p>
            <p className="mt-1 text-xs text-[#64748b]">
              조합 {migrationValidation.fund_rows}행 / 고유 LP {migrationValidation.lp_rows}건 / 납입회차 {migrationValidation.contribution_rows}행
            </p>
            {migrationValidation.warnings.length > 0 && (
              <div className="mt-2 rounded border border-[#d4a418] bg-[#fff7d6] px-3 py-2 text-xs text-[#624100]">
                <p className="font-semibold">확인 필요</p>
                <ul className="mt-1 space-y-1">
                  {migrationValidation.warnings.map((warning, index) => (
                    <li key={`${warning.row}-${warning.column}-${index}`}>
                      row {warning.row} / {warning.column}: {warning.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {migrationValidation.errors.length > 0 && (
              <div className="mt-2 max-h-48 overflow-auto rounded border border-[#d8e5fb] bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-[#f5f9ff] text-[#64748b]">
                    <tr>
                      <th className="px-2 py-1 text-left">row</th>
                      <th className="px-2 py-1 text-left">column</th>
                      <th className="px-2 py-1 text-left">reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {migrationValidation.errors.map((error, index) => (
                      <tr key={`${error.row}-${error.column}-${index}`} className="border-t">
                        <td className="px-2 py-1">{error.row}</td>
                        <td className="px-2 py-1">{error.column}</td>
                        <td className="px-2 py-1 text-red-600">{error.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card-base">
        <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">조합 목록</h3>
        {isLoading ? (
          <p className="p-2 text-sm text-[#64748b]">불러오는 중...</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {funds?.map((fund) => {
              const dateInfo = fundDateInfo(fund)
              const commitmentFmt = formatKRWFull(fund.commitment_total)
              const paidIn = fund.paid_in_total ?? 0
              const paidInFmt = formatKRWFull(paidIn)
              const paidInPercent = fund.commitment_total ? Math.round((paidIn / fund.commitment_total) * 100) : 0

              return (
                <div
                  key={fund.id}
                  onClick={() => navigate(`/funds/${fund.id}`)}
                  className="card-base cursor-pointer p-4 hover:ring-1 hover:ring-blue-200"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-[#0f1f3d]">{fund.name}</h4>
                      <p className="mt-0.5 text-xs text-[#64748b]">
                        {fund.type} | {dateInfo.label}: {dateInfo.date}
                      </p>
                      {fund.registration_number && <p className="mt-0.5 text-xs text-[#64748b]">고유번호: {fund.registration_number}</p>}
                    </div>
                    <span className={fund.status === 'active' ? 'tag tag-green' : 'tag tag-gray'}>
                      {labelStatus(fund.status)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm md:grid-cols-4">
                    {fund.commitment_total != null && (
                      <div className="text-[#64748b]">
                        <span className="text-xs">약정총액</span>
                        <p className="font-medium text-[#0f1f3d]">{commitmentFmt.full}</p>
                        {commitmentFmt.label && <p className="text-[11px] text-[#64748b]">{commitmentFmt.label}</p>}
                      </div>
                    )}
                    <div className="text-[#64748b]">
                      <span className="text-xs">납입현황</span>
                      <p className="font-medium text-[#0f1f3d]">{paidInFmt.full}</p>
                      <p className="text-[11px] text-[#64748b]">{paidInPercent}%</p>
                    </div>
                    <div className="text-[#64748b]">
                      <span className="text-xs">투자건수</span>
                      <p className="font-medium text-[#0f1f3d]">{fund.investment_count ?? 0}건</p>
                    </div>
                    <div className="text-[#64748b]">
                      <span className="text-xs">등록성립일</span>
                      <p className="font-medium text-[#0f1f3d]">{fund.registration_date || '-'}</p>
                    </div>
                  </div>
                </div>
              )
            })}
            {!funds?.length && <EmptyState emoji="🏦" message="등록된 조합이 없어요" className="py-8" />}
          </div>
        )}
      </div>
    </div>
  )
}



