import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  fetchFunds,
  createFund,
  createFundLP,
  fetchGPEntities,
  createGPEntity,
  updateGPEntity,
  type Fund,
  type FundInput,
  type GPEntity,
  type GPEntityInput,
  type LPInput,
} from '../lib/api'
import { formatKRWFull, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Plus, X } from 'lucide-react'

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
  gp: '',
  co_gp: '',
  trustee: '',
  commitment_total: null,
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
        <h3 className="font-semibold text-gray-800">고유계정 등록/수정</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">법인명</label>
          <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">법인유형</label>
          <select value={form.entity_type} onChange={(e) => setForm((prev) => ({ ...prev, entity_type: e.target.value as GPEntityInput['entity_type'] }))} className="w-full rounded-lg border px-3 py-2 text-sm">
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">사업자등록번호</label>
          <input value={form.business_number || ''} onChange={(e) => setForm((prev) => ({ ...prev, business_number: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">대표자</label>
          <input value={form.representative || ''} onChange={(e) => setForm((prev) => ({ ...prev, representative: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">주소</label>
          <input value={form.address || ''} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
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
        <button onClick={onCancel} className="secondary-btn">취소</button>
      </div>
    </div>
  )
}

function FundForm({
  title,
  initial,
  gpEntities,
  loading,
  onSubmit,
  onCancel,
}: {
  title: string
  initial: FundInput
  gpEntities: GPEntity[]
  loading: boolean
  onSubmit: (data: { fund: FundInput; lps: LPInput[] }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FundInput>(initial)
  const [lps, setLps] = useState<LPInput[]>([])

  const updateLp = (index: number, key: keyof LPInput, value: string | number | null) => {
    setLps((prev) => prev.map((lp, lpIndex) => (
      lpIndex === index ? { ...lp, [key]: value } : lp
    )))
  }

  return (
    <div className="card-base space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">조합명</label>
          <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="예: V:ON 1호" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">조합유형</label>
          <select
            value={form.type}
            onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
            className="w-full px-3 py-2 text-sm border rounded-lg"
          >
            {FUND_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
          <select
            value={form.status || 'active'}
            onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
            className="w-full px-3 py-2 text-sm border rounded-lg"
          >
            {FUND_STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">결성일</label>
          <input
            type="date"
            value={form.formation_date || ''}
            onChange={e => setForm(prev => ({ ...prev, formation_date: e.target.value }))}
            className="w-full px-3 py-2 text-sm border rounded-lg"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">고유번호증 번호</label>
          <input
            value={form.registration_number || ''}
            onChange={e => setForm(prev => ({ ...prev, registration_number: e.target.value }))}
            className="w-full px-3 py-2 text-sm border rounded-lg"
            placeholder="예: 123-45-67890"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">등록성립일</label>
          <input
            type="date"
            value={form.registration_date || ''}
            onChange={e => setForm(prev => ({ ...prev, registration_date: e.target.value || null }))}
            className="w-full px-3 py-2 text-sm border rounded-lg"
          />
        </div>
        {form.status !== 'forming' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">만기일</label>
            <input
              type="date"
              value={form.maturity_date || ''}
              onChange={e => setForm(prev => ({ ...prev, maturity_date: e.target.value || null }))}
              className="w-full px-3 py-2 text-sm border rounded-lg"
            />
          </div>
        )}
        {(form.status === 'dissolved' || form.status === 'liquidated') && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">해산일</label>
            <input
              type="date"
              value={form.dissolution_date || ''}
              onChange={e => setForm(prev => ({ ...prev, dissolution_date: e.target.value || null }))}
              className="w-full px-3 py-2 text-sm border rounded-lg"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">GP</label>
          <select value={form.gp || ''} onChange={e => setForm(prev => ({ ...prev, gp: e.target.value || null }))} className="w-full px-3 py-2 text-sm border rounded-lg">
            <option value="">고유계정 선택</option>
            {gpEntities.map((entity) => (
              <option key={entity.id} value={entity.name}>{entity.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Co-GP</label>
          <input value={form.co_gp || ''} onChange={e => setForm(prev => ({ ...prev, co_gp: e.target.value }))} placeholder="예: 공동운용사명" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">신탁사</label>
          <input value={form.trustee || ''} onChange={e => setForm(prev => ({ ...prev, trustee: e.target.value }))} placeholder="예: OO은행" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">총 약정액</label>
          <input type="number" value={form.commitment_total ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment_total: e.target.value ? Number(e.target.value) : null }))} placeholder="숫자만 입력" className="w-full px-3 py-2 text-sm border rounded-lg" />
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700">LP 목록 (선택)</h4>
          <button
            onClick={() => setLps((prev) => [...prev, { name: '', type: LP_TYPE_OPTIONS[0], commitment: null, paid_in: null, contact: '', business_number: '', address: '' }])}
            className="text-xs text-blue-600 hover:underline"
          >
            + LP 추가
          </button>
        </div>
        {!lps.length ? (
          <p className="text-xs text-gray-400">등록할 LP가 있으면 추가하세요.</p>
        ) : (
          <div className="space-y-2">
            {lps.map((lp, index) => (
              <div key={`lp-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1.2fr_1.6fr_1.6fr_1.4fr_1.6fr_auto]">
                <div>
                  <label htmlFor={`lp-name-${index}`} className="sr-only">LP명</label>
                  <input
                    id={`lp-name-${index}`}
                    value={lp.name}
                    onChange={(e) => updateLp(index, 'name', e.target.value)}
                    placeholder="LP명"
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label htmlFor={`lp-type-${index}`} className="sr-only">LP 유형</label>
                  <select
                    id={`lp-type-${index}`}
                    value={lp.type}
                    onChange={(e) => updateLp(index, 'type', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  >
                    {LP_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`lp-commitment-${index}`} className="sr-only">약정금액</label>
                  <input
                    id={`lp-commitment-${index}`}
                    type="number"
                    value={lp.commitment ?? ''}
                    onChange={(e) => updateLp(index, 'commitment', e.target.value ? Number(e.target.value) : null)}
                    placeholder="약정금액"
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label htmlFor={`lp-paidin-${index}`} className="sr-only">최초 납입금액</label>
                  <input
                    id={`lp-paidin-${index}`}
                    type="number"
                    value={lp.paid_in ?? ''}
                    onChange={(e) => updateLp(index, 'paid_in', e.target.value ? Number(e.target.value) : null)}
                    placeholder="최초 납입금액(선택)"
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label htmlFor={`lp-biz-${index}`} className="sr-only">사업자등록번호/생년월일</label>
                  <input
                    id={`lp-biz-${index}`}
                    value={lp.business_number ?? ''}
                    onChange={(e) => updateLp(index, 'business_number', e.target.value)}
                    placeholder="사업자등록번호/생년월일"
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label htmlFor={`lp-address-${index}`} className="sr-only">주소</label>
                  <input
                    id={`lp-address-${index}`}
                    value={lp.address ?? ''}
                    onChange={(e) => updateLp(index, 'address', e.target.value)}
                    placeholder="주소"
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <button
                  onClick={() => setLps((prev) => prev.filter((_, lpIndex) => lpIndex !== index))}
                  className="rounded border border-gray-200 px-2 text-xs text-gray-500 hover:bg-gray-100"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            fund: {
              ...form,
              name: form.name.trim(),
              type: form.type.trim(),
              status: form.status || 'active',
              formation_date: form.formation_date || null,
              registration_number: form.registration_number?.trim() || null,
              registration_date: form.registration_date || null,
              maturity_date: form.maturity_date || null,
              dissolution_date: form.dissolution_date || null,
              gp: form.gp?.trim() || null,
              co_gp: form.co_gp?.trim() || null,
              trustee: form.trustee?.trim() || null,
            },
            lps: lps.map((lp) => ({
              name: lp.name.trim(),
              type: lp.type.trim() || LP_TYPE_OPTIONS[0],
              commitment: lp.commitment ?? null,
              paid_in: lp.paid_in ?? null,
              contact: lp.contact?.trim() || null,
              business_number: lp.business_number?.trim() || null,
              address: lp.address?.trim() || null,
            })),
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

export default function FundsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [showCreateFund, setShowCreateFund] = useState(false)
  const [showGPEdit, setShowGPEdit] = useState(false)

  const { data: funds, isLoading } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: gpEntities = [] } = useQuery<GPEntity[]>({ queryKey: ['gpEntities'], queryFn: fetchGPEntities })
  const primaryGp = gpEntities.find((entity) => entity.is_primary === 1) || gpEntities[0] || null

  const createFundMut = useMutation({
    mutationFn: async ({ fund, lps }: { fund: FundInput; lps: LPInput[] }) => {
      const created = await createFund(fund)
      for (const lp of lps) {
        if (lp.name.trim()) {
          await createFundLP(created.id, lp)
        }
      }
      return created
    },
    onSuccess: (created: Fund) => {
      queryClient.invalidateQueries({ queryKey: ['funds'] })
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">조합 관리</h2>
        <button onClick={() => setShowCreateFund(v => !v)} className="primary-btn inline-flex items-center gap-1"><Plus size={14} /> 조합 추가</button>
      </div>

      <div className="card-base mb-4 border-l-4 border-l-blue-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-blue-600">고유계정 (GP 법인)</p>
            <h3 className="text-lg font-semibold text-gray-900">{primaryGp?.name || '미등록'}</h3>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
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
          initial={primaryGp ? {
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
          } : {
            name: '',
            entity_type: 'vc',
            business_number: '',
            representative: '',
            address: '',
            is_primary: 1,
          }}
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
          <FundForm title="조합 생성" initial={EMPTY_FUND} gpEntities={gpEntities} loading={createFundMut.isPending} onSubmit={data => createFundMut.mutate(data)} onCancel={() => setShowCreateFund(false)} />
        </div>
      )}

      <div className="card-base">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">조합 목록</h3>
        {isLoading ? <p className="text-sm text-gray-500 p-2">불러오는 중...</p> : (
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
                      <h4 className="font-semibold text-gray-900">{fund.name}</h4>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {fund.type} | {dateInfo.label}: {dateInfo.date}
                      </p>
                      {fund.registration_number && (
                        <p className="mt-0.5 text-xs text-gray-500">고유번호: {fund.registration_number}</p>
                      )}
                    </div>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {labelStatus(fund.status)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2 text-sm">
                    {fund.commitment_total != null && (
                      <div className="text-gray-500">
                        <span className="text-xs">약정총액</span>
                        <p className="font-medium text-gray-700">{commitmentFmt.full}</p>
                        {commitmentFmt.label && <p className="text-[11px] text-gray-400">{commitmentFmt.label}</p>}
                      </div>
                    )}
                    <div className="text-gray-500">
                      <span className="text-xs">납입현황</span>
                      <p className="font-medium text-gray-700">{paidInFmt.full}</p>
                      <p className="text-[11px] text-gray-400">{paidInPercent}%</p>
                    </div>
                    <div className="text-gray-500">
                      <span className="text-xs">투자건수</span>
                      <p className="font-medium text-gray-700">{fund.investment_count ?? 0}건</p>
                    </div>
                    <div className="text-gray-500">
                      <span className="text-xs">등록성립일</span>
                      <p className="font-medium text-gray-700">{fund.registration_date || '-'}</p>
                    </div>
                  </div>
                </div>
              )
            })}
            {!funds?.length && <p className="text-sm text-gray-400 p-2">등록된 조합이 없습니다.</p>}
          </div>
        )}
      </div>
    </div>
  )
}








