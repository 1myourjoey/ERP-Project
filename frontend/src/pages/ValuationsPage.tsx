import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createValuation,
  deleteValuation,
  fetchCompanies,
  fetchFunds,
  fetchInvestments,
  fetchValuations,
  updateValuation,
  type Company,
  type Fund,
  type Valuation,
  type ValuationInput,
} from '../lib/api'
import { formatKRW } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'

interface InvestmentOption {
  id: number
  fund_id: number
  company_id: number
}

interface FilterState {
  fund_id: number | null
  company_id: number | null
  investment_id: number | null
  method: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDate(value: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function toPercent(value: number | null | undefined): string {
  if (value == null) return '-'
  return `${value.toFixed(2)}%`
}

const EMPTY_FILTERS: FilterState = {
  fund_id: null,
  company_id: null,
  investment_id: null,
  method: '',
}

const METHOD_LABEL: Record<string, string> = {
  mark_to_market: '최근거래가',
  dcf: 'DCF',
  comparable: '비교법',
  net_asset: '순자산법',
  other: '기타',
  최근거래가: '최근거래가',
  DCF: 'DCF',
  비교법: '비교법',
  순자산법: '순자산법',
  기타: '기타',
}

const METHOD_OPTIONS = ['mark_to_market', 'dcf', 'comparable', 'net_asset', 'other']

function labelMethod(value: string | null | undefined): string {
  if (!value) return '-'
  return METHOD_LABEL[value] ?? value
}

const EMPTY_INPUT: ValuationInput = {
  investment_id: 0,
  fund_id: 0,
  company_id: 0,
  as_of_date: todayIso(),
  evaluator: '',
  method: 'mark_to_market',
  instrument: '',
  value: 0,
  prev_value: null,
  change_amount: null,
  change_pct: null,
  basis: '',
}

function ValuationForm({
  funds,
  companies,
  investments,
  initial,
  submitLabel,
  loading,
  onSubmit,
  onCancel,
}: {
  funds: Fund[]
  companies: Company[]
  investments: InvestmentOption[]
  initial: ValuationInput
  submitLabel: string
  loading: boolean
  onSubmit: (data: ValuationInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ValuationInput>(initial)

  const filteredInvestments = useMemo(
    () =>
      investments.filter((inv) => {
        if (form.fund_id && inv.fund_id !== form.fund_id) return false
        if (form.company_id && inv.company_id !== form.company_id) return false
        return true
      }),
    [investments, form.fund_id, form.company_id],
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <select
          value={form.fund_id || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, fund_id: Number(e.target.value) || 0 }))}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">조합</option>
          {funds.map((fund) => (
            <option key={fund.id} value={fund.id}>
              {fund.name}
            </option>
          ))}
        </select>
        <select
          value={form.company_id || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, company_id: Number(e.target.value) || 0 }))}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">투자사</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        <select
          value={form.investment_id || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, investment_id: Number(e.target.value) || 0 }))}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">투자건</option>
          {filteredInvestments.map((investment) => (
            <option key={investment.id} value={investment.id}>
              #{investment.id}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={form.as_of_date}
          onChange={(e) => setForm((prev) => ({ ...prev, as_of_date: e.target.value }))}
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          value={form.evaluator || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, evaluator: e.target.value }))}
          placeholder="평가 주체"
          className="rounded border px-2 py-1 text-sm"
        />
        <select
          value={form.method || 'mark_to_market'}
          onChange={(e) => setForm((prev) => ({ ...prev, method: e.target.value }))}
          className="rounded border px-2 py-1 text-sm"
        >
          {METHOD_OPTIONS.map((method) => (
            <option key={method} value={method}>
              {labelMethod(method)}
            </option>
          ))}
        </select>
        <input
          value={form.instrument || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, instrument: e.target.value }))}
          placeholder="투자유형"
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          type="number"
          value={form.value}
          onChange={(e) => setForm((prev) => ({ ...prev, value: Number(e.target.value || 0) }))}
          placeholder="평가금액"
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          type="number"
          value={form.prev_value ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, prev_value: e.target.value ? Number(e.target.value) : null }))}
          placeholder="전기 평가금액"
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          type="number"
          value={form.change_amount ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, change_amount: e.target.value ? Number(e.target.value) : null }))}
          placeholder="변동액"
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          type="number"
          step="0.01"
          value={form.change_pct ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, change_pct: e.target.value ? Number(e.target.value) : null }))}
          placeholder="변동률"
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          value={form.basis || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, basis: e.target.value }))}
          placeholder="산출 근거"
          className="rounded border px-2 py-1 text-sm md:col-span-4"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            if (!form.fund_id || !form.company_id || !form.investment_id || !form.as_of_date) return
            onSubmit({
              ...form,
              evaluator: form.evaluator?.trim() || null,
              method: form.method?.trim() || null,
              instrument: form.instrument?.trim() || null,
              basis: form.basis?.trim() || null,
            })
          }}
          disabled={loading}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {submitLabel}
        </button>
        <button onClick={onCancel} className="rounded border bg-white px-3 py-1 text-xs hover:bg-gray-100">
          취소
        </button>
      </div>
    </div>
  )
}

export default function ValuationsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const params = useMemo(
    () => ({
      fund_id: filters.fund_id || undefined,
      company_id: filters.company_id || undefined,
      investment_id: filters.investment_id || undefined,
      method: filters.method.trim() || undefined,
    }),
    [filters],
  )

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: companies } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: fetchCompanies })
  const { data: investments } = useQuery<InvestmentOption[]>({
    queryKey: ['investments', 'valuation-options'],
    queryFn: () => fetchInvestments(),
  })
  const { data: rows, isLoading } = useQuery<Valuation[]>({
    queryKey: ['valuations', params],
    queryFn: () => fetchValuations(params),
  })

  const createMut = useMutation({
    mutationFn: (data: ValuationInput) => createValuation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valuations'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      setShowCreate(false)
      addToast('success', '평가를 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ValuationInput> }) => updateValuation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valuations'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      setEditingId(null)
      addToast('success', '평가를 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteValuation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valuations'] })
      queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
      addToast('success', '평가를 삭제했습니다.')
    },
  })

  const fundNameMap = useMemo(() => new Map((funds || []).map((fund) => [fund.id, fund.name])), [funds])
  const companyNameMap = useMemo(() => new Map((companies || []).map((company) => [company.id, company.name])), [companies])

  return (
    <div className="max-w-7xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">가치평가</h2>
        <button
          onClick={() => setShowCreate((prev) => !prev)}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
        >
          + 신규 평가 등록
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">필터</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            value={filters.fund_id || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">전체 조합</option>
            {funds?.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
          <select
            value={filters.company_id || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, company_id: Number(e.target.value) || null }))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">전체 투자사</option>
            {companies?.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={filters.investment_id || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, investment_id: e.target.value ? Number(e.target.value) : null }))}
            placeholder="투자건 ID"
            className="rounded border px-2 py-1 text-sm"
          />
          <select
            value={filters.method}
            onChange={(e) => setFilters((prev) => ({ ...prev, method: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">전체 방법</option>
            {METHOD_OPTIONS.map((method) => (
              <option key={method} value={method}>
                {labelMethod(method)}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2">
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="rounded border px-2 py-1 text-xs hover:bg-gray-100">
            필터 초기화
          </button>
        </div>
      </div>

      {showCreate && (
        <ValuationForm
          funds={funds || []}
          companies={companies || []}
          investments={investments || []}
          initial={EMPTY_INPUT}
          submitLabel="저장"
          loading={createMut.isPending}
          onSubmit={(data) => createMut.mutate(data)}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">평가 이력</h3>
        {isLoading ? (
          <p className="p-2 text-sm text-gray-500">불러오는 중...</p>
        ) : !rows?.length ? (
          <p className="p-2 text-sm text-gray-400">가치평가 이력이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-gray-200 p-3">
                {editingId === row.id ? (
                  <ValuationForm
                    funds={funds || []}
                    companies={companies || []}
                    investments={investments || []}
                    initial={{
                      investment_id: row.investment_id,
                      fund_id: row.fund_id,
                      company_id: row.company_id,
                      as_of_date: row.as_of_date,
                      evaluator: row.evaluator,
                      method: row.method,
                      instrument: row.instrument,
                      value: row.value,
                      prev_value: row.prev_value,
                      change_amount: row.change_amount,
                      change_pct: row.change_pct,
                      basis: row.basis,
                    }}
                    submitLabel="저장"
                    loading={updateMut.isPending}
                    onSubmit={(data) => updateMut.mutate({ id: row.id, data })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {toDate(row.as_of_date)} | {labelMethod(row.method)} | {row.instrument || '-'}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        조합: {row.fund_name || fundNameMap.get(row.fund_id) || row.fund_id} | 투자사:{' '}
                        {row.company_name || companyNameMap.get(row.company_id) || row.company_id} | 투자건 #{row.investment_id}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        평가금액 {formatKRW(row.value)} | 전기 평가금액 {formatKRW(row.prev_value)} | 변동액 {formatKRW(row.change_amount)} ({toPercent(row.change_pct)})
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        평가 주체: {row.evaluator || '-'} | 산출 근거: {row.basis || '-'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditingId(row.id)} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('이 평가를 삭제하시겠습니까?')) deleteMut.mutate(row.id)
                        }}
                        className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


