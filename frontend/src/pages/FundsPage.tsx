import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchFunds, createFund, type Fund, type FundInput } from '../lib/api'
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

const EMPTY_FUND: FundInput = {
  name: '',
  type: FUND_TYPE_OPTIONS[0],
  formation_date: '',
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
    const today = new Date()
    const todayText = today.toLocaleDateString('ko-KR')
    const days = fund.formation_date
      ? Math.max(0, Math.floor((today.getTime() - new Date(fund.formation_date).getTime()) / 86400000))
      : null
    return { label: '운용 중', date: `${todayText}${days != null ? ` (${days}일째)` : ''}` }
  }

  const dissolvedDate = (fund as Fund & { dissolution_date?: string | null }).dissolution_date
  return { label: '해산/청산 완료', date: fund.maturity_date || dissolvedDate || '-' }
}

function FundForm({
  title,
  initial,
  loading,
  onSubmit,
  onCancel,
}: {
  title: string
  initial: FundInput
  loading: boolean
  onSubmit: (data: FundInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FundInput>(initial)

  return (
    <div className="card-base space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="조합명" className="px-3 py-2 text-sm border rounded-lg" />
        <select
          value={form.type}
          onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
          className="px-3 py-2 text-sm border rounded-lg"
        >
          {FUND_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select
          value={form.status || 'active'}
          onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
          className="px-3 py-2 text-sm border rounded-lg"
        >
          {FUND_STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>{status.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={form.formation_date || ''}
          onChange={e => setForm(prev => ({ ...prev, formation_date: e.target.value }))}
          className="px-3 py-2 text-sm border rounded-lg"
          placeholder="결성일"
        />
        {form.status !== 'forming' && (
          <input
            type="date"
            value={form.maturity_date || ''}
            onChange={e => setForm(prev => ({ ...prev, maturity_date: e.target.value || null }))}
            className="px-3 py-2 text-sm border rounded-lg"
            placeholder="만기일"
          />
        )}
        {(form.status === 'dissolved' || form.status === 'liquidated') && (
          <input
            type="date"
            value={form.dissolution_date || ''}
            onChange={e => setForm(prev => ({ ...prev, dissolution_date: e.target.value || null }))}
            className="px-3 py-2 text-sm border rounded-lg"
            placeholder="해산/청산일"
          />
        )}
        <input value={form.gp || ''} onChange={e => setForm(prev => ({ ...prev, gp: e.target.value }))} placeholder="GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.co_gp || ''} onChange={e => setForm(prev => ({ ...prev, co_gp: e.target.value }))} placeholder="Co-GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.trustee || ''} onChange={e => setForm(prev => ({ ...prev, trustee: e.target.value }))} placeholder="신탁사" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.commitment_total ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment_total: e.target.value ? Number(e.target.value) : null }))} placeholder="총 약정액" className="px-3 py-2 text-sm border rounded-lg" />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            ...form,
            name: form.name.trim(),
            type: form.type.trim(),
            status: form.status || 'active',
            formation_date: form.formation_date || null,
            maturity_date: form.maturity_date || null,
            dissolution_date: form.dissolution_date || null,
            gp: form.gp?.trim() || null,
            co_gp: form.co_gp?.trim() || null,
            trustee: form.trustee?.trim() || null,
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

  const { data: funds, isLoading } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })

  const createFundMut = useMutation({
    mutationFn: createFund,
    onSuccess: (created: Fund) => {
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      setShowCreateFund(false)
      addToast('success', '조합이 생성되었습니다.')
      navigate(`/funds/${created.id}`)
    },
  })

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">조합 관리</h2>
        <button onClick={() => setShowCreateFund(v => !v)} className="primary-btn inline-flex items-center gap-1"><Plus size={14} /> 조합 추가</button>
      </div>

      {showCreateFund && (
        <div className="mb-4">
          <FundForm title="조합 생성" initial={EMPTY_FUND} loading={createFundMut.isPending} onSubmit={data => createFundMut.mutate(data)} onCancel={() => setShowCreateFund(false)} />
        </div>
      )}

      <div className="card-base">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">조합 목록</h3>
        {isLoading ? <p className="text-sm text-gray-500 p-2">불러오는 중...</p> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {funds?.map((fund) => {
              const dateInfo = fundDateInfo(fund)
              const commitmentFmt = formatKRWFull(fund.commitment_total)

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
                    </div>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {labelStatus(fund.status)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {fund.commitment_total != null && (
                      <div className="text-gray-500">
                        <span className="text-xs">약정총액</span>
                        <p className="font-medium text-gray-700">{commitmentFmt.full}</p>
                        {commitmentFmt.label && <p className="text-[11px] text-gray-400">{commitmentFmt.label}</p>}
                      </div>
                    )}
                    <div className="text-gray-500">
                      <span className="text-xs">투자건수</span>
                      <p className="font-medium text-gray-700">{fund.investment_count ?? 0}건</p>
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








