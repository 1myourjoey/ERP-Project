import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  calculateManagementFee,
  fetchFeeConfig,
  fetchFeeWaterfall,
  fetchFunds,
  fetchManagementFees,
  fetchManagementFeesByFund,
  fetchPerformanceFeeSimulations,
  simulatePerformanceFee,
  updateFeeConfig,
  updateManagementFee,
  updatePerformanceFeeSimulation,
  type FeeConfigInput,
  type Fund,
  type ManagementFeeResponse,
  type PerformanceFeeSimulationResponse,
  type WaterfallResponse,
} from '../lib/api'
import PageLoading from '../components/PageLoading'
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import WorkbenchSplit from '../components/common/page/WorkbenchSplit'
import FinanceTabStrip from '../components/finance/FinanceTabStrip'
import WaterfallSummary from '../components/finance/WaterfallSummary'
import { useToast } from '../contexts/ToastContext'
import { formatKRW } from '../lib/labels'

type TabKey = 'overview' | 'management' | 'performance'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '보수 현황' },
  { key: 'management', label: '관리보수' },
  { key: 'performance', label: '성과보수' },
]

const BASIS_OPTIONS = [
  { value: 'commitment', label: '약정총액' },
  { value: 'nav', label: '순자산가치' },
  { value: 'invested', label: '투자잔액' },
]

const PRORATION_OPTIONS = [
  { value: 'equal_quarter', label: '균등분기(연율/4)' },
  { value: 'actual_365', label: '일할계산(Actual/365)' },
  { value: 'actual_366', label: '일할계산(Actual/366)' },
  { value: 'actual_actual', label: '일할계산(Actual/Actual)' },
]

const SCENARIO_OPTIONS = [
  { value: 'worst', label: '보수적' },
  { value: 'base', label: '기준' },
  { value: 'best', label: '낙관' },
] as const

function toDateLabel(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function feeBasisLabel(value: string | null | undefined) {
  if (value === 'split') return '분기 중 기준 전환'
  return BASIS_OPTIONS.find((option) => option.value === value)?.label || value || '-'
}

function prorationMethodLabel(value: string | null | undefined) {
  return PRORATION_OPTIONS.find((option) => option.value === value)?.label || value || '-'
}

function scenarioLabel(value: string) {
  return SCENARIO_OPTIONS.find((option) => option.value === value)?.label || value
}

function phaseLabel(value: string | null | undefined) {
  if (value === 'split') return '분기 중 기준 전환'
  return value === 'post_investment' ? '투자기간 종료 후' : '투자기간 중'
}

function formatRatePercent(value: number | null | undefined) {
  return `${((value || 0) * 100).toFixed(2)}%`
}

function quarterStartDate(year: number, quarter: number) {
  return new Date(year, (quarter - 1) * 3, 1)
}

function quarterDayCount(year: number, quarter: number) {
  return Math.round((new Date(year, quarter * 3, 0).getTime() - quarterStartDate(year, quarter).getTime()) / 86400000) + 1
}

function quarterEndDate(year: number, quarter: number) {
  return new Date(year, quarter * 3, 0)
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function resolvePreviewPhase(fund: Fund | null, year: number, quarter: number) {
  if (!fund?.investment_period_end) return 'investment'
  const quarterStart = quarterStartDate(year, quarter)
  const quarterEnd = quarterEndDate(year, quarter)
  const investmentEnd = new Date(fund.investment_period_end)
  if (quarterStart > investmentEnd) return 'post_investment'
  if (quarterStart <= investmentEnd && investmentEnd < quarterEnd) return 'split'
  return 'investment'
}

function statusTone(status: string): 'default' | 'warning' | 'success' {
  if (status === '수령' || status === '지급' || status === '확정') return 'success'
  if (status === '청구') return 'warning'
  return 'default'
}

function StatusPill({ status }: { status: string }) {
  return <span className={`finance-status-pill finance-status-${statusTone(status)}`}>{status}</span>
}

export default function FeeManagementPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null)
  const [calcYear, setCalcYear] = useState<number>(new Date().getFullYear())
  const [calcQuarter, setCalcQuarter] = useState<number>(Math.ceil((new Date().getMonth() + 1) / 3))
  const [scenario, setScenario] = useState<'worst' | 'base' | 'best'>('base')

  const { data: funds = [] } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })

  useEffect(() => {
    if (!selectedFundId && funds.length > 0) {
      setSelectedFundId(funds[0].id)
    }
  }, [funds, selectedFundId])

  const { data: allManagementFees = [], isLoading: overviewLoading } = useQuery<ManagementFeeResponse[]>({
    queryKey: ['fees', 'management'],
    queryFn: () => fetchManagementFees(),
  })

  const { data: managementFees = [], isLoading: managementLoading } = useQuery<ManagementFeeResponse[]>({
    queryKey: ['fees', 'management', selectedFundId],
    queryFn: () => fetchManagementFeesByFund(selectedFundId as number),
    enabled: selectedFundId !== null,
  })

  const { data: feeConfig, isLoading: configLoading } = useQuery({
    queryKey: ['fees', 'config', selectedFundId],
    queryFn: () => fetchFeeConfig(selectedFundId as number),
    enabled: selectedFundId !== null,
  })

  const { data: performanceRows = [], isLoading: performanceLoading } = useQuery<PerformanceFeeSimulationResponse[]>({
    queryKey: ['fees', 'performance', selectedFundId],
    queryFn: () => fetchPerformanceFeeSimulations(selectedFundId as number),
    enabled: selectedFundId !== null,
  })

  const { data: waterfall, isLoading: waterfallLoading } = useQuery<WaterfallResponse>({
    queryKey: ['fees', 'waterfall', selectedFundId],
    queryFn: () => fetchFeeWaterfall(selectedFundId as number),
    enabled: selectedFundId !== null && performanceRows.length > 0,
    retry: false,
  })

  const updateConfigMut = useMutation({
    mutationFn: (data: FeeConfigInput) => updateFeeConfig(selectedFundId as number, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'config', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['fees', 'management'] })
      addToast('success', '보수 설정을 저장했습니다.')
    },
  })

  const calculateMut = useMutation({
    mutationFn: () => calculateManagementFee({ fund_id: selectedFundId as number, year: calcYear, quarter: calcQuarter }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'management'] })
      queryClient.invalidateQueries({ queryKey: ['fees', 'management', selectedFundId] })
      addToast('success', '관리보수를 계산했습니다.')
    },
  })

  const updateManagementMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateManagementFee(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'management'] })
      queryClient.invalidateQueries({ queryKey: ['fees', 'management', selectedFundId] })
      addToast('success', '관리보수 상태를 업데이트했습니다.')
    },
  })

  const simulateMut = useMutation({
    mutationFn: () =>
      simulatePerformanceFee({
        fund_id: selectedFundId as number,
        simulation_date: new Date().toISOString().slice(0, 10),
        scenario,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'performance', selectedFundId] })
      queryClient.invalidateQueries({ queryKey: ['fees', 'waterfall', selectedFundId] })
      addToast('success', '성과보수 시뮬레이션을 실행했습니다.')
    },
  })

  const updatePerformanceMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updatePerformanceFeeSimulation(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fees', 'performance', selectedFundId] })
      addToast('success', '성과보수 상태를 업데이트했습니다.')
    },
  })

  const summaryByFund = useMemo(() => {
    const map = new Map<number, { totalFee: number; unpaidCount: number }>()
    for (const row of allManagementFees) {
      const current = map.get(row.fund_id) || { totalFee: 0, unpaidCount: 0 }
      current.totalFee += Number(row.fee_amount || 0)
      if (row.status !== '수령') current.unpaidCount += 1
      map.set(row.fund_id, current)
    }
    return map
  }, [allManagementFees])

  const latestManagementByFund = useMemo(() => {
    const map = new Map<number, ManagementFeeResponse>()
    for (const row of allManagementFees) {
      const current = map.get(row.fund_id)
      if (!current) {
        map.set(row.fund_id, row)
        continue
      }
      const currentKey = `${current.year}-${String(current.quarter).padStart(2, '0')}`
      const nextKey = `${row.year}-${String(row.quarter).padStart(2, '0')}`
      if (nextKey > currentKey) map.set(row.fund_id, row)
    }
    return map
  }, [allManagementFees])

  const [draftConfig, setDraftConfig] = useState<FeeConfigInput | null>(null)
  useEffect(() => {
    if (feeConfig) {
      setDraftConfig({
        mgmt_fee_rate: feeConfig.mgmt_fee_rate,
        mgmt_fee_basis: feeConfig.mgmt_fee_basis,
        mgmt_fee_period: feeConfig.mgmt_fee_period,
        mgmt_fee_proration_method: feeConfig.mgmt_fee_proration_method,
        liquidation_fee_rate: feeConfig.liquidation_fee_rate,
        liquidation_fee_basis: feeConfig.liquidation_fee_basis,
        hurdle_rate: feeConfig.hurdle_rate,
        carry_rate: feeConfig.carry_rate,
        catch_up_rate: feeConfig.catch_up_rate,
        clawback: feeConfig.clawback,
      })
    }
  }, [feeConfig])

  const selectedFund = funds.find((fund) => fund.id === selectedFundId) ?? null
  const selectedSummary = selectedFundId ? summaryByFund.get(selectedFundId) : null
  const latestPerformanceRow = performanceRows[0]
  const managementPreview = useMemo(() => {
    if (!draftConfig) return null
    const appliedPhase = resolvePreviewPhase(selectedFund, calcYear, calcQuarter)
    const quarterDays = quarterDayCount(calcYear, calcQuarter)
    const baseYearDays =
      draftConfig.mgmt_fee_proration_method === 'actual_365'
        ? 365
        : draftConfig.mgmt_fee_proration_method === 'actual_366'
          ? 366
          : draftConfig.mgmt_fee_proration_method === 'actual_actual'
            ? (isLeapYear(calcYear) ? 366 : 365)
            : null
    if (appliedPhase === 'split' && selectedFund?.investment_period_end) {
      const investmentEnd = new Date(selectedFund.investment_period_end)
      const investmentDays = Math.round((investmentEnd.getTime() - quarterStartDate(calcYear, calcQuarter).getTime()) / 86400000) + 1
      const postDays = quarterDays - investmentDays
      const investmentRate = draftConfig.mgmt_fee_rate
      const postRate = draftConfig.liquidation_fee_rate ?? draftConfig.mgmt_fee_rate
      const investmentBasis = draftConfig.mgmt_fee_basis
      const postBasis = draftConfig.liquidation_fee_basis || draftConfig.mgmt_fee_basis
      return {
        appliedPhase,
        basis: 'split',
        rate: investmentRate,
        factorLabel: baseYearDays ? `${investmentDays}/${baseYearDays} + ${postDays}/${baseYearDays}` : `${investmentDays}/${quarterDays}Q + ${postDays}/${quarterDays}Q`,
        periodDays: quarterDays,
        yearDays: baseYearDays,
        detailLabel: `투자기간 중 ${feeBasisLabel(investmentBasis)} × ${formatRatePercent(investmentRate)} + 종료 후 ${feeBasisLabel(postBasis)} × ${formatRatePercent(postRate)}`,
      }
    }
    const basis =
      appliedPhase === 'post_investment'
        ? draftConfig.liquidation_fee_basis || draftConfig.mgmt_fee_basis
        : draftConfig.mgmt_fee_basis
    const rate =
      appliedPhase === 'post_investment' && draftConfig.liquidation_fee_rate != null
        ? draftConfig.liquidation_fee_rate
        : draftConfig.mgmt_fee_rate
    const factorLabel = baseYearDays ? `${quarterDays}/${baseYearDays}` : '1/4'
    return {
      appliedPhase,
      basis,
      rate,
      factorLabel,
      periodDays: quarterDays,
      yearDays: baseYearDays,
      detailLabel: null,
    }
  }, [calcQuarter, calcYear, draftConfig, selectedFund])

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="수수료"
        subtitle="관리보수 계산, 성과보수 시뮬레이션, 워터폴 분배를 같은 재무 작업대에서 운영합니다."
      />

      <PageMetricStrip
        items={[
          { label: '선택 조합', value: selectedFund?.name || '-', hint: '현재 작업 기준', tone: 'info' },
          { label: '누적 관리보수', value: formatKRW(selectedSummary?.totalFee || 0), hint: '선택 조합 기준', tone: 'default' },
          { label: '미수령 건수', value: `${selectedSummary?.unpaidCount || 0}건`, hint: '수금 필요 건수', tone: (selectedSummary?.unpaidCount || 0) > 0 ? 'warning' : 'success' },
          { label: '성과 시뮬레이션', value: `${performanceRows.length}건`, hint: latestPerformanceRow ? `${scenarioLabel(latestPerformanceRow.scenario)} 시나리오 최근 실행` : '이력 없음', tone: 'default' },
        ]}
      />

      <PageControlStrip compact>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] lg:items-end">
          <div>
            <label className="form-label">조합</label>
            <select
              value={selectedFundId || ''}
              onChange={(e) => setSelectedFundId(e.target.value ? Number(e.target.value) : null)}
              className="form-input"
            >
              <option value="">조합 선택</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </div>
          <FinanceTabStrip
            tabs={TABS.map((tab) => ({
              ...tab,
              countLabel:
                tab.key === 'overview'
                  ? `${funds.length}조합`
                  : tab.key === 'management'
                    ? `${managementFees.length}건`
                    : `${performanceRows.length}건`,
            }))}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>
      </PageControlStrip>

      {activeTab === 'overview' && (
        <SectionScaffold
          title="조합별 보수 현황"
          description="조합별 관리보수 누계와 미수령 상태를 빠르게 비교합니다."
        >
          {overviewLoading ? (
            <PageLoading />
          ) : !funds.length ? (
            <div className="finance-empty">조합 데이터가 없습니다.</div>
          ) : (
            <div className="compact-table-wrap">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="table-head-row">
                  <tr>
                    <th className="table-head-cell">조합</th>
                    <th className="table-head-cell text-right">누적 관리보수</th>
                    <th className="table-head-cell text-right">미수령</th>
                    <th className="table-head-cell">최근 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {funds.map((fund) => {
                    const summary = summaryByFund.get(fund.id) || { totalFee: 0, unpaidCount: 0 }
                    const latestManagement = latestManagementByFund.get(fund.id)
                    return (
                      <tr key={fund.id} className={`hover:bg-[#f5f9ff] ${selectedFundId === fund.id ? 'bg-[#f5f9ff]' : ''}`}>
                        <td className="table-body-cell">
                          <button type="button" className="text-left text-[#0f1f3d] hover:text-[#1a3660]" onClick={() => setSelectedFundId(fund.id)}>
                            {fund.name}
                          </button>
                        </td>
                        <td className="table-body-cell text-right">{formatKRW(summary.totalFee)}</td>
                        <td className="table-body-cell text-right">{summary.unpaidCount}건</td>
                        <td className="table-body-cell">{latestManagement ? <StatusPill status={latestManagement.status} /> : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionScaffold>
      )}

      {activeTab === 'management' && (
        <WorkbenchSplit
          primary={
            <SectionScaffold title="관리보수 설정 및 분기 계산" description="연 관리보수율, 기준금액, 안분방식과 투자기간 종료 후 전환 규칙을 함께 관리합니다.">
              {configLoading || !draftConfig ? (
                <PageLoading />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div className="space-y-3 rounded-xl border border-[#d8e5fb] bg-[#f8fbff] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-[#0f1f3d]">투자기간 중 기준</p>
                          <p className="text-[11px] text-[#64748b]">약정총액, 투자잔액, 순자산가치 중 기준금액을 선택합니다.</p>
                        </div>
                        <span className="finance-summary-chip">적용: {phaseLabel('investment')}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <label className="form-label">연 관리보수율</label>
                          <input type="number" step="0.0001" value={draftConfig.mgmt_fee_rate} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, mgmt_fee_rate: Number(e.target.value || 0) } : prev)} className="form-input" />
                        </div>
                        <div>
                          <label className="form-label">기준금액</label>
                          <select value={draftConfig.mgmt_fee_basis} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, mgmt_fee_basis: e.target.value } : prev)} className="form-input">
                            {BASIS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="form-label">안분 방식</label>
                          <select value={draftConfig.mgmt_fee_proration_method} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, mgmt_fee_proration_method: e.target.value } : prev)} className="form-input">
                            {PRORATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-[#d8e5fb] bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-[#0f1f3d]">투자기간 종료 후 전환</p>
                          <p className="text-[11px] text-[#64748b]">미입력 시 투자기간 중 기준과 연율을 그대로 사용합니다.</p>
                        </div>
                        <span className="finance-summary-chip">종료일 {selectedFund?.investment_period_end ? toDateLabel(selectedFund.investment_period_end) : '-'}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <label className="form-label">종료 후 연율</label>
                          <input type="number" step="0.0001" value={draftConfig.liquidation_fee_rate ?? ''} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, liquidation_fee_rate: e.target.value === '' ? null : Number(e.target.value) } : prev)} className="form-input" placeholder="미입력 시 기존 연율 유지" />
                        </div>
                        <div>
                          <label className="form-label">종료 후 기준금액</label>
                          <select value={draftConfig.liquidation_fee_basis ?? ''} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, liquidation_fee_basis: e.target.value || null } : prev)} className="form-input">
                            <option value="">투자기간 중 기준 유지</option>
                            {BASIS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="form-label">허들율</label>
                          <input type="number" step="0.0001" value={draftConfig.hurdle_rate} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, hurdle_rate: Number(e.target.value || 0) } : prev)} className="form-input" />
                        </div>
                        <div>
                          <label className="form-label">캐리율</label>
                          <input type="number" step="0.0001" value={draftConfig.carry_rate} onChange={(e) => setDraftConfig((prev) => prev ? { ...prev, carry_rate: Number(e.target.value || 0) } : prev)} className="form-input" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#d8e5fb] bg-[#f5f9ff] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-[#0f1f3d]">계산식 미리보기</p>
                        <p className="text-[11px] text-[#64748b]">현재 선택한 분기와 조합 기준으로 어떤 규칙이 적용되는지 보여줍니다.</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="finance-summary-chip">적용구간 {phaseLabel(managementPreview?.appliedPhase)}</span>
                        <span className="finance-summary-chip">기준 {feeBasisLabel(managementPreview?.basis)}</span>
                        <span className="finance-summary-chip">안분 {prorationMethodLabel(draftConfig.mgmt_fee_proration_method)}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                      <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                        <p className="text-[11px] text-[#64748b]">적용 연율</p>
                        <p className="mt-1 font-data text-sm font-semibold text-[#0f1f3d]">{formatRatePercent(managementPreview?.rate)}</p>
                      </div>
                      <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                        <p className="text-[11px] text-[#64748b]">안분계수</p>
                        <p className="mt-1 font-data text-sm font-semibold text-[#0f1f3d]">{managementPreview?.factorLabel || '-'}</p>
                      </div>
                      <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                        <p className="text-[11px] text-[#64748b]">분기</p>
                        <p className="mt-1 font-data text-sm font-semibold text-[#0f1f3d]">{calcYear}년 {calcQuarter}분기</p>
                      </div>
                      <div className="rounded-lg border border-[#d8e5fb] bg-white px-3 py-2">
                        <p className="text-[11px] text-[#64748b]">식</p>
                        <p className="mt-1 text-xs font-semibold text-[#0f1f3d]">
                          {managementPreview?.detailLabel || `기준금액 × ${formatRatePercent(managementPreview?.rate)} × ${managementPreview?.factorLabel || '-'}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => updateConfigMut.mutate(draftConfig)} className="primary-btn" disabled={updateConfigMut.isPending}>설정 저장</button>
                  </div>

                  <div className="border-t border-[#d8e5fb] pt-4">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div>
                        <label className="form-label">연도</label>
                        <input type="number" value={calcYear} onChange={(e) => setCalcYear(Number(e.target.value || new Date().getFullYear()))} className="form-input" placeholder="연도" />
                      </div>
                      <div>
                        <label className="form-label">분기</label>
                        <select value={calcQuarter} onChange={(e) => setCalcQuarter(Number(e.target.value || 1))} className="form-input">
                          <option value={1}>1분기</option>
                          <option value={2}>2분기</option>
                          <option value={3}>3분기</option>
                          <option value={4}>4분기</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button onClick={() => calculateMut.mutate()} className="primary-btn w-full" disabled={!selectedFundId || calculateMut.isPending}>계산 실행</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionScaffold>
          }
          secondary={
            <SectionScaffold title="관리보수 이력" description="적용구간, 기준금액, 안분방식을 포함한 계산 결과를 분기별로 추적합니다.">
              {managementLoading ? (
                <PageLoading />
              ) : !managementFees.length ? (
                <div className="finance-empty">관리보수 이력이 없습니다.</div>
              ) : (
                <div className="finance-list">
                  {managementFees.map((row) => (
                    <div key={row.id} className="finance-list-row">
                      <div className="finance-list-row-main">
                        <div className="min-w-0">
                          <p className="finance-list-row-title">{row.year}년 {row.quarter}분기</p>
                          <p className="finance-list-row-meta">
                            {row.applied_phase === 'split' && row.calculation_detail
                              ? row.calculation_detail
                              : `${phaseLabel(row.applied_phase)} · 기준 ${feeBasisLabel(row.fee_basis)} · 기준금액 ${formatKRW(row.basis_amount)}`}
                          </p>
                        </div>
                        <div className="finance-list-row-actions">
                          <StatusPill status={row.status} />
                          <button onClick={() => updateManagementMut.mutate({ id: row.id, status: '청구' })} className="secondary-btn btn-xs">청구</button>
                          <button onClick={() => updateManagementMut.mutate({ id: row.id, status: '수령' })} className="primary-btn btn-xs">수령</button>
                        </div>
                      </div>
                      <div className="finance-inline-summary">
                        <span className="finance-summary-chip">관리보수 {formatKRW(row.fee_amount)}</span>
                        <span className="finance-summary-chip">안분 {prorationMethodLabel(row.proration_method)}</span>
                        <span className="finance-summary-chip">
                          계수 {row.year_days ? `${row.period_days || 0}/${row.year_days}` : '1/4'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionScaffold>
          }
        />
      )}

      {activeTab === 'performance' && (
        <WorkbenchSplit
          primary={
            <SectionScaffold title="성과보수 시뮬레이션" description="시나리오별 성과보수 추정과 지급 상태를 관리합니다.">
              <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[180px_minmax(0,1fr)] md:items-end">
                <div>
                  <label className="form-label">시나리오</label>
                  <select value={scenario} onChange={(e) => setScenario(e.target.value as 'worst' | 'base' | 'best')} className="form-input">
                    {SCENARIO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => simulateMut.mutate()} disabled={!selectedFundId || simulateMut.isPending} className="primary-btn">시뮬레이션 실행</button>
                </div>
              </div>

              {performanceLoading ? (
                <PageLoading />
              ) : !performanceRows.length ? (
                <div className="finance-empty">성과보수 시뮬레이션 이력이 없습니다.</div>
              ) : (
                <div className="finance-list">
                  {performanceRows.map((row) => (
                    <div key={row.id} className="finance-list-row">
                      <div className="finance-list-row-main">
                        <div className="min-w-0">
                          <p className="finance-list-row-title">{toDateLabel(row.simulation_date)} · {scenarioLabel(row.scenario)}</p>
                          <p className="finance-list-row-meta">분배총액 {formatKRW(row.total_distributed || 0)} · LP 순수익 {formatKRW(row.lp_net_return || 0)}</p>
                        </div>
                        <div className="finance-list-row-actions">
                          <StatusPill status={row.status} />
                          <button onClick={() => updatePerformanceMut.mutate({ id: row.id, status: '확정' })} className="secondary-btn btn-xs">확정</button>
                          <button onClick={() => updatePerformanceMut.mutate({ id: row.id, status: '지급' })} className="primary-btn btn-xs">지급</button>
                        </div>
                      </div>
                      <div className="finance-inline-summary">
                        <span className="finance-summary-chip">Carry {formatKRW(row.carry_amount || 0)}</span>
                        <span className="finance-summary-chip">LP 순수익 {formatKRW(row.lp_net_return || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionScaffold>
          }
          secondary={
            <SectionScaffold title="워터폴" description="현재 선택 조합의 분배 구조를 단계별로 확인합니다.">
              {waterfallLoading ? (
                <PageLoading />
              ) : !waterfall ? (
                <div className="finance-empty">표시할 워터폴 데이터가 없습니다.</div>
              ) : (
                <WaterfallSummary {...waterfall} />
              )}
            </SectionScaffold>
          }
        />
      )}
    </div>
  )
}
