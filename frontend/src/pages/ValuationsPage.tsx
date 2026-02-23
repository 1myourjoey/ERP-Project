import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  bulkCreateValuations,
  createValuation,
  deleteValuation,
  fetchFunds,
  fetchInvestments,
  fetchValuationDashboard,
  fetchValuationHistory,
  fetchValuationNavSummary,
  fetchValuations,
  updateValuation,
  type Fund,
  type Investment,
  type Valuation,
  type ValuationBulkCreateInput,
  type ValuationInput,
} from '../lib/api'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import { useToast } from '../contexts/ToastContext'
import { formatKRW } from '../lib/labels'
import { invalidateFundRelated } from '../lib/queryInvalidation'

type TabKey = 'dashboard' | 'history' | 'records'

type FilterState = {
  fund_id: number | null
  investment_id: number | null
  method: string
}

const EMPTY_FILTERS: FilterState = {
  fund_id: null,
  investment_id: null,
  method: '',
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function toDateLabel(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function toPercent(value: number | null | undefined) {
  if (value == null) return '-'
  return `${value.toFixed(2)}%`
}

function methodLabel(value: string | null | undefined) {
  if (!value) return '-'
  const map: Record<string, string> = {
    mark_to_market: '최근거래가',
    dcf: 'DCF',
    comparable: '비교법',
    net_asset: '순자산법',
    other: '기타',
    recent_transaction: '최근거래',
    NAV: 'NAV',
  }
  return map[value] || value
}

const METHOD_OPTIONS = ['mark_to_market', 'dcf', 'comparable', 'net_asset', 'other', 'recent_transaction', 'NAV']

function valuationToInput(row: Valuation): ValuationInput {
  return {
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
    valuation_method: row.valuation_method,
    instrument_type: row.instrument_type,
    conversion_price: row.conversion_price,
    exercise_price: row.exercise_price,
    liquidation_pref: row.liquidation_pref,
    participation_cap: row.participation_cap,
    fair_value_per_share: row.fair_value_per_share,
    total_fair_value: row.total_fair_value,
    book_value: row.book_value,
    unrealized_gain_loss: row.unrealized_gain_loss,
    valuation_date: row.valuation_date,
  }
}

function ValuationSimpleForm({
  funds,
  investments,
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  loading,
}: {
  funds: Fund[]
  investments: Investment[]
  value: ValuationInput
  onChange: (next: ValuationInput) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
  loading: boolean
}) {
  const filteredInvestments = useMemo(() => {
    return investments.filter((row) => !value.fund_id || row.fund_id === value.fund_id)
  }, [investments, value.fund_id])

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
          <select
            value={value.fund_id || ''}
            onChange={(e) => onChange({ ...value, fund_id: Number(e.target.value) || 0 })}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            <option value="">조합 선택</option>
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>{fund.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">투자건</label>
          <select
            value={value.investment_id || ''}
            onChange={(e) => {
              const id = Number(e.target.value) || 0
              const row = investments.find((item) => item.id === id)
              onChange({
                ...value,
                investment_id: id,
                fund_id: row?.fund_id || value.fund_id,
                company_id: row?.company_id || value.company_id,
              })
            }}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            <option value="">투자건 선택</option>
            {filteredInvestments.map((row) => (
              <option key={row.id} value={row.id}>#{row.id} {row.company_name || ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">평가기준일</label>
          <input
            type="date"
            value={value.as_of_date || todayIso()}
            onChange={(e) => onChange({ ...value, as_of_date: e.target.value })}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">평가방법</label>
          <select
            value={value.method || 'mark_to_market'}
            onChange={(e) => onChange({ ...value, method: e.target.value })}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            {METHOD_OPTIONS.map((method) => (
              <option key={method} value={method}>{methodLabel(method)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">평가금액</label>
          <input
            type="number"
            value={value.value}
            onChange={(e) => onChange({ ...value, value: Number(e.target.value || 0) })}
            className="w-full rounded border px-2 py-1 text-sm"
            placeholder="평가금액"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onSubmit}
          disabled={loading}
          className="primary-btn"
        >
          {submitLabel}
        </button>
        <button onClick={onCancel} className="secondary-btn">취소</button>
      </div>
    </div>
  )
}

export default function ValuationsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<ValuationInput | null>(null)
  const [historyInvestmentId, setHistoryInvestmentId] = useState<number | null>(null)

  const [newForm, setNewForm] = useState<ValuationInput>({
    investment_id: 0,
    fund_id: 0,
    company_id: 0,
    as_of_date: todayIso(),
    method: 'mark_to_market',
    value: 0,
    instrument: null,
    evaluator: null,
    prev_value: null,
    change_amount: null,
    change_pct: null,
    basis: null,
  })

  const [bulkFundId, setBulkFundId] = useState<number | null>(null)
  const [bulkDate, setBulkDate] = useState(todayIso())

  const valuationParams = useMemo(
    () => ({
      fund_id: filters.fund_id || undefined,
      investment_id: filters.investment_id || undefined,
      method: filters.method.trim() || undefined,
    }),
    [filters],
  )

  const { data: funds = [] } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: investments = [] } = useQuery<Investment[]>({
    queryKey: ['investments', 'valuations-page'],
    queryFn: () => fetchInvestments(),
  })

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['valuations', 'dashboard', filters.fund_id],
    queryFn: () => fetchValuationDashboard(filters.fund_id || undefined),
  })

  const { data: navSummary = [] } = useQuery({
    queryKey: ['valuations', 'nav-summary'],
    queryFn: fetchValuationNavSummary,
  })

  const { data: valuations = [], isLoading: valuationsLoading } = useQuery<Valuation[]>({
    queryKey: ['valuations', valuationParams],
    queryFn: () => fetchValuations(valuationParams),
  })

  const { data: historyRows = [], isLoading: historyLoading } = useQuery({
    queryKey: ['valuations', 'history', historyInvestmentId],
    queryFn: () => fetchValuationHistory(historyInvestmentId as number),
    enabled: historyInvestmentId !== null,
  })

  const createMut = useMutation({
    mutationFn: (payload: ValuationInput) => createValuation(payload),
    onSuccess: () => {
      invalidateFundRelated(queryClient, newForm.fund_id || undefined)
      queryClient.invalidateQueries({ queryKey: ['valuations'] })
      setShowCreate(false)
      setNewForm((prev) => ({ ...prev, value: 0 }))
      addToast('success', '가치평가를 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ValuationInput }) => updateValuation(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valuations'] })
      setEditingId(null)
      setEditForm(null)
      addToast('success', '가치평가를 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteValuation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valuations'] })
      addToast('success', '가치평가를 삭제했습니다.')
    },
  })

  const bulkMut = useMutation({
    mutationFn: async () => {
      if (!bulkFundId) {
        throw new Error('조합을 선택해 주세요.')
      }
      const fundInvestments = investments.filter((row) => row.fund_id === bulkFundId)
      if (!fundInvestments.length) {
        throw new Error('선택한 조합에 투자건이 없습니다.')
      }

      const latestMap = new Map<number, Valuation>()
      for (const row of valuations.filter((item) => item.fund_id === bulkFundId)) {
        if (!latestMap.has(row.investment_id)) {
          latestMap.set(row.investment_id, row)
        }
      }

      const payload: ValuationBulkCreateInput = {
        as_of_date: bulkDate,
        items: fundInvestments.map((investment) => {
          const latest = latestMap.get(investment.id)
          return {
            investment_id: investment.id,
            fund_id: investment.fund_id,
            company_id: investment.company_id,
            value: Number(latest?.value || investment.amount || 0),
            book_value: latest?.book_value ?? latest?.prev_value ?? null,
            total_fair_value: latest?.total_fair_value ?? latest?.value ?? Number(investment.amount || 0),
            unrealized_gain_loss: latest?.unrealized_gain_loss ?? null,
            method: latest?.method ?? 'mark_to_market',
            valuation_method: latest?.valuation_method ?? latest?.method ?? 'mark_to_market',
            instrument: latest?.instrument ?? investment.instrument ?? null,
            instrument_type: latest?.instrument_type ?? latest?.instrument ?? investment.instrument ?? null,
            basis: latest?.basis ?? '분기 말 일괄 생성',
          }
        }),
      }
      return bulkCreateValuations(payload)
    },
    onSuccess: (rows) => {
      queryClient.invalidateQueries({ queryKey: ['valuations'] })
      queryClient.invalidateQueries({ queryKey: ['valuations', 'dashboard'] })
      addToast('success', `${rows.length}건 평가를 일괄 등록했습니다.`)
    },
    onError: (error: Error) => {
      addToast('error', error.message)
    },
  })

  const maxHistoryValue = useMemo(() => {
    const values = historyRows.map((row) => Number(row.total_fair_value || 0))
    return Math.max(1, ...values)
  }, [historyRows])

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">가치평가</h2>
          <p className="page-subtitle">NAV 대시보드, 시계열 이력, 분기말 일괄 평가를 통합 관리합니다.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'dashboard' as const, label: '평가 대시보드' },
          { key: 'history' as const, label: '이력/일괄 평가' },
          { key: 'records' as const, label: '평가 레코드' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <>
          {dashboardLoading ? (
            <PageLoading />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="card-base p-3">
                  <p className="text-xs text-gray-500">전체 NAV</p>
                  <p className="mt-1 text-lg font-bold text-gray-800">{formatKRW(dashboardData?.total_nav || 0)}</p>
                </div>
                <div className="card-base p-3">
                  <p className="text-xs text-gray-500">미실현 손익</p>
                  <p className={`mt-1 text-lg font-bold ${(dashboardData?.total_unrealized_gain_loss || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatKRW(dashboardData?.total_unrealized_gain_loss || 0)}
                  </p>
                </div>
                <div className="card-base p-3">
                  <p className="text-xs text-gray-500">평가 완료 건</p>
                  <p className="mt-1 text-lg font-bold text-gray-800">{dashboardData?.valuation_count || 0}건</p>
                </div>
                <div className="card-base p-3">
                  <p className="text-xs text-gray-500">미평가 건</p>
                  <p className="mt-1 text-lg font-bold text-gray-800">{dashboardData?.unvalued_count || 0}건</p>
                </div>
              </div>

              <div className="card-base overflow-hidden">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">투자건별 최신 평가</h3>
                {!dashboardData?.items.length ? (
                  <EmptyState emoji="💎" message="표시할 평가 데이터가 없습니다." className="py-8" />
                ) : (
                  <div className="overflow-auto">
                    <table className="min-w-[980px] w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">투자사</th>
                          <th className="px-3 py-2 text-left">투자유형</th>
                          <th className="px-3 py-2 text-right">장부가</th>
                          <th className="px-3 py-2 text-right">공정가치</th>
                          <th className="px-3 py-2 text-right">미실현손익</th>
                          <th className="px-3 py-2 text-left">평가일</th>
                          <th className="px-3 py-2 text-left">방법</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {dashboardData.items.map((item) => (
                          <tr key={item.investment_id}>
                            <td className="px-3 py-2">{item.company_name}</td>
                            <td className="px-3 py-2 text-gray-600">{item.instrument_type || item.instrument || '-'}</td>
                            <td className="px-3 py-2 text-right">{formatKRW(item.book_value || 0)}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-800">{formatKRW(item.total_fair_value || 0)}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${(item.unrealized_gain_loss || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatKRW(item.unrealized_gain_loss || 0)}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{toDateLabel(item.valuation_date)}</td>
                            <td className="px-3 py-2 text-gray-600">{methodLabel(item.valuation_method || item.method)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card-base overflow-hidden">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">조합별 NAV 요약</h3>
                {!navSummary.length ? (
                  <EmptyState emoji="📊" message="조합별 NAV 데이터가 없습니다." className="py-8" />
                ) : (
                  <div className="overflow-auto">
                    <table className="min-w-[720px] w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">조합</th>
                          <th className="px-3 py-2 text-right">총 NAV</th>
                          <th className="px-3 py-2 text-right">총 미실현손익</th>
                          <th className="px-3 py-2 text-right">평가건수</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {navSummary.map((row) => (
                          <tr key={row.fund_id}>
                            <td className="px-3 py-2">{row.fund_name}</td>
                            <td className="px-3 py-2 text-right">{formatKRW(row.total_nav)}</td>
                            <td className={`px-3 py-2 text-right font-medium ${row.total_unrealized_gain_loss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatKRW(row.total_unrealized_gain_loss)}
                            </td>
                            <td className="px-3 py-2 text-right">{row.valuation_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">투자건 시계열 가치</h3>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">투자건 선택</label>
              <select
                value={historyInvestmentId || ''}
                onChange={(e) => setHistoryInvestmentId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded border px-2 py-1 text-sm"
              >
                <option value="">투자건 선택</option>
                {investments.map((row) => (
                  <option key={row.id} value={row.id}>#{row.id} {row.company_name || ''}</option>
                ))}
              </select>
            </div>

            {historyLoading ? (
              <PageLoading />
            ) : !historyInvestmentId ? (
              <EmptyState emoji="📈" message="투자건을 선택해 주세요." className="py-8" />
            ) : !historyRows.length ? (
              <EmptyState emoji="📉" message="해당 투자건의 평가 이력이 없습니다." className="py-8" />
            ) : (
              <div className="space-y-2">
                {historyRows.map((row) => {
                  const value = Number(row.total_fair_value || 0)
                  const width = Math.max(4, Math.round((value / maxHistoryValue) * 100))
                  return (
                    <div key={row.id} className="rounded border border-gray-200 p-2">
                      <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                        <span>{toDateLabel(row.valuation_date || row.as_of_date)}</span>
                        <span>{formatKRW(value)}</span>
                      </div>
                      <div className="h-2 rounded bg-gray-100">
                        <div className="h-2 rounded bg-blue-500" style={{ width: `${width}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        장부가 {formatKRW(row.book_value || 0)} / 손익 {formatKRW(row.unrealized_gain_loss || 0)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">분기말 일괄 평가</h3>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
                <select
                  value={bulkFundId || ''}
                  onChange={(e) => setBulkFundId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded border px-2 py-1 text-sm"
                >
                  <option value="">조합 선택</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>{fund.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">평가 기준일</label>
                <input
                  type="date"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="w-full rounded border px-2 py-1 text-sm"
                />
              </div>
            </div>

            <button
              onClick={() => bulkMut.mutate()}
              disabled={bulkMut.isPending}
              className="primary-btn mt-3"
            >
              {bulkMut.isPending ? '생성 중...' : '분기말 일괄 생성'}
            </button>

            <p className="mt-2 text-xs text-gray-500">
              선택한 조합의 투자건별 최신 평가를 기반으로 기준일 평가를 일괄 생성합니다.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'records' && (
        <>
          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">필터</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">조합</label>
                <select
                  value={filters.fund_id || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full rounded border px-2 py-1 text-sm"
                >
                  <option value="">전체 조합</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>{fund.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">투자건</label>
                <select
                  value={filters.investment_id || ''}
                  onChange={(e) => setFilters((prev) => ({ ...prev, investment_id: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full rounded border px-2 py-1 text-sm"
                >
                  <option value="">전체 투자건</option>
                  {investments.map((row) => (
                    <option key={row.id} value={row.id}>#{row.id} {row.company_name || ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">평가방법</label>
                <select
                  value={filters.method}
                  onChange={(e) => setFilters((prev) => ({ ...prev, method: e.target.value }))}
                  className="w-full rounded border px-2 py-1 text-sm"
                >
                  <option value="">전체</option>
                  {METHOD_OPTIONS.map((method) => (
                    <option key={method} value={method}>{methodLabel(method)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={() => setFilters(EMPTY_FILTERS)} className="secondary-btn">초기화</button>
                <button onClick={() => setShowCreate((prev) => !prev)} className="primary-btn">신규 등록</button>
              </div>
            </div>
          </div>

          {showCreate && (
            <ValuationSimpleForm
              funds={funds}
              investments={investments}
              value={newForm}
              onChange={setNewForm}
              onSubmit={() => createMut.mutate(newForm)}
              onCancel={() => setShowCreate(false)}
              submitLabel="저장"
              loading={createMut.isPending}
            />
          )}

          <div className="card-base">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">평가 레코드</h3>
            {valuationsLoading ? (
              <PageLoading />
            ) : !valuations.length ? (
              <EmptyState emoji="🗂️" message="조건에 맞는 평가 레코드가 없습니다." className="py-8" />
            ) : (
              <div className="space-y-2">
                {valuations.map((row) => (
                  <div key={row.id} className="rounded-lg border border-gray-200 p-3">
                    {editingId === row.id && editForm ? (
                      <ValuationSimpleForm
                        funds={funds}
                        investments={investments}
                        value={editForm}
                        onChange={setEditForm}
                        onSubmit={() => updateMut.mutate({ id: row.id, payload: editForm })}
                        onCancel={() => {
                          setEditingId(null)
                          setEditForm(null)
                        }}
                        submitLabel="저장"
                        loading={updateMut.isPending}
                      />
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {toDateLabel(row.valuation_date || row.as_of_date)} · #{row.investment_id} · {methodLabel(row.valuation_method || row.method)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {row.company_name || `회사 #${row.company_id}`} · 평가금액 {formatKRW(row.total_fair_value || row.value)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            장부가 {formatKRW(row.book_value || row.prev_value || 0)} · 손익 {formatKRW(row.unrealized_gain_loss || row.change_amount || 0)} ({toPercent(row.change_pct)})
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingId(row.id)
                              setEditForm(valuationToInput(row))
                            }}
                            className="secondary-btn"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('이 평가를 삭제하시겠습니까?')) {
                                deleteMut.mutate(row.id)
                              }
                            }}
                            className="danger-btn"
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
        </>
      )}
    </div>
  )
}
