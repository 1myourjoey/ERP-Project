import { useRef } from 'react'
import type { FundInput, GPEntity } from '../../lib/api'
import KrwAmountInput from '../common/KrwAmountInput'

export const FUND_TYPE_OPTIONS = [
  '투자조합',
  '벤처투자조합',
  '신기술투자조합',
  '사모투자합자회사(PEF)',
  '창업투자조합',
  '농림수산식품투자조합',
  '기타',
]

export const FUND_STATUS_OPTIONS = [
  { value: 'forming', label: '결성예정' },
  { value: 'active', label: '운용 중' },
  { value: 'dissolved', label: '해산' },
  { value: 'liquidated', label: '청산 완료' },
]

const CONTRIBUTION_TYPE_OPTIONS = ['일시', '분할', '수시']

type FundCoreFieldsProps = {
  form: FundInput
  onChange: (next: FundInput) => void
  gpEntities?: GPEntity[]
}

export default function FundCoreFields({ form, onChange, gpEntities = [] }: FundCoreFieldsProps) {
  const update = <K extends keyof FundInput>(key: K, value: FundInput[K]) => {
    onChange({ ...form, [key]: value })
  }
  const lastAutoGpCommitmentRef = useRef<number | null>(form.gp_commitment ?? null)
  const gpCommitmentOverriddenRef = useRef(false)

  const hasGpEntities = gpEntities.length > 0
  const linkedGpEntity = gpEntities.find((entity) => entity.id === (form.gp_entity_id ?? null)) ?? null

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">조합명</label>
        <input
          value={form.name ?? ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="예: V:ON 1호"
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">조합유형</label>
        <select
          value={form.type ?? FUND_TYPE_OPTIONS[0]}
          onChange={(e) => update('type', e.target.value)}
          className="form-input"
        >
          {FUND_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
        <select
          value={form.status || 'active'}
          onChange={(e) => update('status', e.target.value)}
          className="form-input"
        >
          {FUND_STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">결성일</label>
        <input
          type="date"
          value={form.formation_date || ''}
          onChange={(e) => update('formation_date', e.target.value || null)}
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">고유번호증 번호</label>
        <input
          value={form.registration_number || ''}
          onChange={(e) => update('registration_number', e.target.value)}
          className="form-input"
          placeholder="예: 123-45-67890"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">등록성립일</label>
        <input
          type="date"
          value={form.registration_date || ''}
          onChange={(e) => update('registration_date', e.target.value || null)}
          className="form-input"
        />
      </div>
      {form.status !== 'forming' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">만기일</label>
          <input
            type="date"
            value={form.maturity_date || ''}
            onChange={(e) => update('maturity_date', e.target.value || null)}
            className="form-input"
          />
        </div>
      )}
      {(form.status === 'dissolved' || form.status === 'liquidated') && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[#64748b]">해산일</label>
          <input
            type="date"
            value={form.dissolution_date || ''}
            onChange={(e) => update('dissolution_date', e.target.value || null)}
            className="form-input"
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">GP 법인</label>
        {hasGpEntities ? (
          <select
            value={form.gp_entity_id ?? ''}
            onChange={(e) => {
              const nextId = Number(e.target.value || 0) || null
              const nextEntity = gpEntities.find((entity) => entity.id === nextId) ?? null
              onChange({
                ...form,
                gp_entity_id: nextId,
                gp: nextEntity?.name ?? form.gp ?? null,
              })
            }}
            className="form-input"
          >
            <option value="">고유계정 미연결</option>
            {gpEntities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
                {entity.business_number ? ` (${entity.business_number})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <input
            value=""
            readOnly
            placeholder="등록된 GP 법인이 없습니다"
            className="form-input"
          />
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">GP</label>
        <input
          value={linkedGpEntity?.name || form.gp || ''}
          onChange={(e) => update('gp', e.target.value)}
          placeholder="GP"
          disabled={linkedGpEntity !== null}
          className={`form-input ${linkedGpEntity ? 'bg-[#f8fafc] text-[#475569]' : ''}`}
        />
        {linkedGpEntity && (
          <p className="mt-1 text-[11px] text-[#64748b]">고유계정과 연결되어 자동 동기화됩니다.</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">대표 펀드매니저</label>
        <input
          value={form.fund_manager || ''}
          onChange={(e) => update('fund_manager', e.target.value)}
          placeholder="대표 펀드매니저"
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">Co-GP</label>
        <input
          value={form.co_gp || ''}
          onChange={(e) => update('co_gp', e.target.value)}
          placeholder="예: 공동운용사명"
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">신탁사</label>
        <input
          value={form.trustee || ''}
          onChange={(e) => update('trustee', e.target.value)}
          placeholder="예: OO은행"
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">총 약정액</label>
        <KrwAmountInput
          value={form.commitment_total ?? null}
          onChange={(nextCommitment) => {
            const autoGpCommitment = nextCommitment == null ? null : Math.round(nextCommitment * 0.01)
            const currentGpCommitment = form.gp_commitment ?? null
            const lastAutoGpCommitment = lastAutoGpCommitmentRef.current
            const shouldAutoSyncGp =
              !gpCommitmentOverriddenRef.current ||
              currentGpCommitment == null ||
              (lastAutoGpCommitment != null && currentGpCommitment === lastAutoGpCommitment)

            const nextForm: FundInput = {
              ...form,
              commitment_total: nextCommitment,
            }
            if (shouldAutoSyncGp) {
              nextForm.gp_commitment = autoGpCommitment
              gpCommitmentOverriddenRef.current = false
            }
            lastAutoGpCommitmentRef.current = autoGpCommitment
            onChange(nextForm)
          }}
          className="form-input"
          placeholder="숫자만 입력"
          helperClassName="mt-1 text-[11px] text-[#64748b]"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">GP 출자금</label>
        <KrwAmountInput
          value={form.gp_commitment ?? null}
          onChange={(nextGpCommitment) => {
            const autoGpCommitment = lastAutoGpCommitmentRef.current
            gpCommitmentOverriddenRef.current =
              autoGpCommitment == null
                ? nextGpCommitment != null
                : nextGpCommitment !== autoGpCommitment
            update('gp_commitment', nextGpCommitment)
          }}
          className="form-input"
          placeholder="숫자만 입력"
          helperClassName="mt-1 text-[11px] text-[#64748b]"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">출자방식</label>
        <select
          value={form.contribution_type || ''}
          onChange={(e) => update('contribution_type', e.target.value || null)}
          className="form-input"
        >
          <option value="">출자방식 선택</option>
          {CONTRIBUTION_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">투자기간 종료일</label>
        <input
          type="date"
          value={form.investment_period_end || ''}
          onChange={(e) => update('investment_period_end', e.target.value || null)}
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">관리보수율(%)</label>
        <input
          type="number"
          step="0.01"
          value={form.mgmt_fee_rate ?? ''}
          onChange={(e) => update('mgmt_fee_rate', e.target.value ? Number(e.target.value) : null)}
          placeholder="관리보수율(%)"
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">성과보수율(%)</label>
        <input
          type="number"
          step="0.01"
          value={form.performance_fee_rate ?? ''}
          onChange={(e) => update('performance_fee_rate', e.target.value ? Number(e.target.value) : null)}
          placeholder="성과보수율(%)"
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">허들레이트(%)</label>
        <input
          type="number"
          step="0.01"
          value={form.hurdle_rate ?? ''}
          onChange={(e) => update('hurdle_rate', e.target.value ? Number(e.target.value) : null)}
          placeholder="허들레이트(%)"
          className="form-input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[#64748b]">운용계좌번호</label>
        <input
          value={form.account_number || ''}
          onChange={(e) => update('account_number', e.target.value)}
          placeholder="운용계좌번호"
          className="form-input"
        />
      </div>
    </div>
  )
}



