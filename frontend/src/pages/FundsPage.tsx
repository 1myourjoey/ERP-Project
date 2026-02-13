import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchFunds, createFund, type Fund, type FundInput } from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import { Building2, ChevronRight, Plus, X } from 'lucide-react'

const EMPTY_FUND: FundInput = {
  name: '',
  type: '투자조합',
  formation_date: '',
  status: 'active',
  gp: '',
  co_gp: '',
  trustee: '',
  commitment_total: null,
  aum: null,
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
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="조합명" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} placeholder="조합 유형" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="date" value={form.formation_date || ''} onChange={e => setForm(prev => ({ ...prev, formation_date: e.target.value }))} className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.status || ''} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} placeholder="상태(예: active)" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.gp || ''} onChange={e => setForm(prev => ({ ...prev, gp: e.target.value }))} placeholder="GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.co_gp || ''} onChange={e => setForm(prev => ({ ...prev, co_gp: e.target.value }))} placeholder="Co-GP" className="px-3 py-2 text-sm border rounded-lg" />
        <input value={form.trustee || ''} onChange={e => setForm(prev => ({ ...prev, trustee: e.target.value }))} placeholder="신탁사" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.commitment_total ?? ''} onChange={e => setForm(prev => ({ ...prev, commitment_total: e.target.value ? Number(e.target.value) : null }))} placeholder="총 약정액" className="px-3 py-2 text-sm border rounded-lg" />
        <input type="number" value={form.aum ?? ''} onChange={e => setForm(prev => ({ ...prev, aum: e.target.value ? Number(e.target.value) : null }))} placeholder="AUM" className="px-3 py-2 text-sm border rounded-lg" />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({
            ...form,
            name: form.name.trim(),
            type: form.type.trim(),
            formation_date: form.formation_date || null,
            gp: form.gp?.trim() || null,
            co_gp: form.co_gp?.trim() || null,
            trustee: form.trustee?.trim() || null,
          })}
          disabled={loading || !form.name.trim()}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
        >
          저장
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">취소</button>
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
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">조합 관리</h2>
        <button onClick={() => setShowCreateFund(v => !v)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"><Plus size={14} /> 조합 추가</button>
      </div>

      {showCreateFund && (
        <div className="mb-4">
          <FundForm title="조합 생성" initial={EMPTY_FUND} loading={createFundMut.isPending} onSubmit={data => createFundMut.mutate(data)} onCancel={() => setShowCreateFund(false)} />
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-3">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">조합 목록</h3>
        {isLoading ? <p className="text-sm text-gray-500 p-2">불러오는 중...</p> : (
          <div className="space-y-2">
            {funds?.map((fund) => (
              <button
                key={fund.id}
                onClick={() => navigate(`/funds/${fund.id}`)}
                className="w-full text-left p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-800 flex items-center gap-2"><Building2 size={15} />{fund.name}</h4>
                  <ChevronRight size={16} className="text-gray-400" />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {fund.type} | {labelStatus(fund.status)} | LP {fund.lp_count ?? 0} | 투자 {fund.investment_count ?? 0}
                </p>
              </button>
            ))}
            {!funds?.length && <p className="text-sm text-gray-400 p-2">등록된 조합이 없습니다.</p>}
          </div>
        )}
      </div>
    </div>
  )
}


