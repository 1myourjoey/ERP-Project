import { useRef } from 'react'
import type { FundInput } from '../../lib/api'

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

type GPOption = {
  value: string
  label: string
}

type FundCoreFieldsProps = {
  form: FundInput
  onChange: (next: FundInput) => void
  gpOptions?: GPOption[]
}

function parseNumericInput(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return null
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export default function FundCoreFields({ form, onChange, gpOptions = [] }: FundCoreFieldsProps) {
  const update = <K extends keyof FundInput>(key: K, value: FundInput[K]) => {
    onChange({ ...form, [key]: value })
  }
  const lastAutoGpCommitmentRef = useRef<number | null>(form.gp_commitment ?? null)
  const gpCommitmentOverriddenRef = useRef(false)

  const hasGpOptions = gpOptions.length > 0

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">조합명</label>
        <input
          value={form.name ?? ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="예: V:ON 1호"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">조합유형</label>
        <select
          value={form.type ?? FUND_TYPE_OPTIONS[0]}
          onChange={(e) => update('type', e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        >
          {FUND_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
        <select
          value={form.status || 'active'}
          onChange={(e) => update('status', e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        >
          {FUND_STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">결성일</label>
        <input
          type="date"
          value={form.formation_date || ''}
          onChange={(e) => update('formation_date', e.target.value || null)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">고유번호증 번호</label>
        <input
          value={form.registration_number || ''}
          onChange={(e) => update('registration_number', e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="예: 123-45-67890"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">등록성립일</label>
        <input
          type="date"
          value={form.registration_date || ''}
          onChange={(e) => update('registration_date', e.target.value || null)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      {form.status !== 'forming' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">만기일</label>
          <input
            type="date"
            value={form.maturity_date || ''}
            onChange={(e) => update('maturity_date', e.target.value || null)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      )}
      {(form.status === 'dissolved' || form.status === 'liquidated') && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">해산일</label>
          <input
            type="date"
            value={form.dissolution_date || ''}
            onChange={(e) => update('dissolution_date', e.target.value || null)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">GP</label>
        {hasGpOptions ? (
          <select
            value={form.gp || ''}
            onChange={(e) => update('gp', e.target.value || null)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">고유계정 선택</option>
            {gpOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={form.gp || ''}
            onChange={(e) => update('gp', e.target.value)}
            placeholder="GP"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">대표 펀드매니저</label>
        <input
          value={form.fund_manager || ''}
          onChange={(e) => update('fund_manager', e.target.value)}
          placeholder="대표 펀드매니저"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Co-GP</label>
        <input
          value={form.co_gp || ''}
          onChange={(e) => update('co_gp', e.target.value)}
          placeholder="예: 공동운용사명"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">신탁사</label>
        <input
          value={form.trustee || ''}
          onChange={(e) => update('trustee', e.target.value)}
          placeholder="예: OO은행"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">총 약정액</label>
        <input
          type="number"
          value={form.commitment_total ?? ''}
          onChange={(e) => {
            const nextCommitment = parseNumericInput(e.target.value)
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
          placeholder="숫자만 입력"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">GP 출자금</label>
        <input
          type="number"
          value={form.gp_commitment ?? ''}
          onChange={(e) => {
            const nextGpCommitment = parseNumericInput(e.target.value)
            const autoGpCommitment = lastAutoGpCommitmentRef.current
            gpCommitmentOverriddenRef.current =
              autoGpCommitment == null
                ? nextGpCommitment != null
                : nextGpCommitment !== autoGpCommitment
            update('gp_commitment', nextGpCommitment)
          }}
          placeholder="숫자만 입력"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">출자방식</label>
        <select
          value={form.contribution_type || ''}
          onChange={(e) => update('contribution_type', e.target.value || null)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
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
        <label className="mb-1 block text-xs font-medium text-gray-600">투자기간 종료일</label>
        <input
          type="date"
          value={form.investment_period_end || ''}
          onChange={(e) => update('investment_period_end', e.target.value || null)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">관리보수율(%)</label>
        <input
          type="number"
          step="0.01"
          value={form.mgmt_fee_rate ?? ''}
          onChange={(e) => update('mgmt_fee_rate', e.target.value ? Number(e.target.value) : null)}
          placeholder="관리보수율(%)"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">성과보수율(%)</label>
        <input
          type="number"
          step="0.01"
          value={form.performance_fee_rate ?? ''}
          onChange={(e) => update('performance_fee_rate', e.target.value ? Number(e.target.value) : null)}
          placeholder="성과보수율(%)"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">허들레이트(%)</label>
        <input
          type="number"
          step="0.01"
          value={form.hurdle_rate ?? ''}
          onChange={(e) => update('hurdle_rate', e.target.value ? Number(e.target.value) : null)}
          placeholder="허들레이트(%)"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">운용계좌번호</label>
        <input
          value={form.account_number || ''}
          onChange={(e) => update('account_number', e.target.value)}
          placeholder="운용계좌번호"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
    </div>
  )
}
