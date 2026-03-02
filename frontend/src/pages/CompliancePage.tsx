import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  completeComplianceObligation,
  createComplianceRule,
  deleteComplianceRule,
  fetchComplianceAmendments,
  fetchComplianceChecks,
  fetchComplianceDashboard,
  fetchComplianceLLMUsage,
  fetchComplianceObligations,
  fetchComplianceRules,
  fetchComplianceScanHistory,
  fetchFunds,
  interpretComplianceQuery,
  runComplianceCheck,
  triggerComplianceManualScan,
  updateComplianceRule,
  type ComplianceDashboardAmendmentAlert,
  type ComplianceDashboardFundStatusItem,
  type ComplianceDashboardRecentCheckItem,
  type ComplianceCheckRecord,
  type ComplianceDashboardSummary,
  type ComplianceDocument,
  type ComplianceInterpretResponse,
  type ComplianceLLMUsageResponse,
  type ComplianceManualScanResponse,
  type ComplianceObligation,
  type ComplianceRule,
  type ComplianceRuleCreateInput,
  type ComplianceScanHistoryResponse,
  type Fund,
} from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'
import AmendmentAlerts from '../components/compliance/AmendmentAlerts'
import AuditTimeline from '../components/compliance/AuditTimeline'
import DocumentLibrary from '../components/compliance/DocumentLibrary'
import FundComplianceGrid from '../components/compliance/FundComplianceGrid'
import MonthlyReport from '../components/compliance/MonthlyReport'
import RemediationTracker from '../components/compliance/RemediationTracker'
import RuleSuggestions from '../components/compliance/RuleSuggestions'
import ViolationPatterns from '../components/compliance/ViolationPatterns'

type TabKey = 'dashboard' | 'obligations' | 'rules' | 'checks' | 'documents' | 'schedule' | 'history'

function statusBadge(row: ComplianceObligation): { label: string; className: string } {
  if (row.status === 'completed') return { label: '완료', className: 'tag tag-green' }
  if (row.status === 'waived') return { label: '면제', className: 'tag tag-gray' }
  if (row.status === 'overdue' || (row.d_day != null && row.d_day < 0)) {
    return { label: '기한초과', className: 'tag tag-red' }
  }
  if (row.d_day != null && row.d_day <= 7) return { label: '기한임박', className: 'tag tag-amber' }
  return { label: '대기', className: 'tag tag-blue' }
}

function checkBadge(result: string): { label: string; className: string } {
  if (result === 'pass') return { label: '적합', className: 'tag tag-green' }
  if (result === 'warning') return { label: '경고', className: 'tag tag-amber' }
  if (result === 'fail') return { label: '위반', className: 'tag tag-red' }
  if (result === 'error') return { label: '오류', className: 'tag tag-red' }
  return { label: result.toUpperCase(), className: 'tag tag-gray' }
}

function dDayLabel(dDay: number | null | undefined): string {
  if (dDay == null) return '-'
  if (dDay < 0) return `D+${Math.abs(dDay)}`
  if (dDay === 0) return 'D-Day'
  return `D-${dDay}`
}

function scopeMeta(scope?: string): { icon: string; label: string; className: string } {
  if (scope === 'fund_type') {
    return {
      icon: '📋',
      label: '유형 가이드',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    }
  }
  if (scope === 'fund') {
    return {
      icon: '🏢',
      label: '조합 문서',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }
  return {
    icon: '🌐',
    label: '공통 법령',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  }
}

function stringifyCondition(condition: Record<string, unknown>): string {
  try {
    return JSON.stringify(condition, null, 2)
  } catch {
    return '{}'
  }
}

function parseCondition(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function defaultYearMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

const emptyRuleForm: ComplianceRuleCreateInput = {
  rule_code: '',
  rule_name: '',
  level: 'L1',
  category: 'governance',
  condition: { type: 'exists', target: 'document' },
  severity: 'warning',
  auto_task: false,
  is_active: true,
}

export default function CompliancePage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')

  const [fundFilter, setFundFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [targetRow, setTargetRow] = useState<ComplianceObligation | null>(null)
  const [completedBy, setCompletedBy] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')

  const [ruleFundFilter, setRuleFundFilter] = useState<number | ''>('')
  const [ruleLevelFilter, setRuleLevelFilter] = useState('')
  const [checkResultFilter, setCheckResultFilter] = useState('')

  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [ruleForm, setRuleForm] = useState<ComplianceRuleCreateInput>(emptyRuleForm)
  const [conditionText, setConditionText] = useState<string>(stringifyCondition(emptyRuleForm.condition))

  const [legalQuery, setLegalQuery] = useState('')
  const [legalFundId, setLegalFundId] = useState<number | ''>('')
  const [usagePeriod, setUsagePeriod] = useState<'month' | 'week' | 'all'>('month')
  const [interpretResult, setInterpretResult] = useState<ComplianceInterpretResponse | null>(null)

  const [scanPeriod, setScanPeriod] = useState<'week' | 'month' | 'all'>('week')
  const [manualScanMode, setManualScanMode] = useState<'daily' | 'full' | 'law'>('daily')
  const [manualScanFundId, setManualScanFundId] = useState<number | ''>('')
  const [manualScanResult, setManualScanResult] = useState<ComplianceManualScanResponse | null>(null)
  const [historyFundId, setHistoryFundId] = useState<number | ''>('')
  const [patternMonths, setPatternMonths] = useState<number>(6)
  const [reportYearMonth, setReportYearMonth] = useState<string>(defaultYearMonth())

  const obligationParams = useMemo(
    () => ({
      fund_id: fundFilter === '' ? undefined : fundFilter,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
    }),
    [fundFilter, statusFilter, categoryFilter],
  )

  const ruleParams = useMemo(
    () => ({
      fund_id: ruleFundFilter === '' ? undefined : ruleFundFilter,
      level: ruleLevelFilter || undefined,
      active_only: false,
    }),
    [ruleFundFilter, ruleLevelFilter],
  )

  const checkParams = useMemo(
    () => ({
      fund_id: ruleFundFilter === '' ? undefined : ruleFundFilter,
      result: checkResultFilter || undefined,
      limit: 200,
    }),
    [ruleFundFilter, checkResultFilter],
  )

  const { data: funds = [] } = useQuery<Fund[]>({
    queryKey: ['funds'],
    queryFn: fetchFunds,
  })
  const { data: dashboard, isLoading: isDashboardLoading } = useQuery<ComplianceDashboardSummary>({
    queryKey: ['complianceDashboard'],
    queryFn: fetchComplianceDashboard,
  })
  const { data: obligations = [], isLoading: isObligationLoading } = useQuery<ComplianceObligation[]>({
    queryKey: ['complianceObligations', obligationParams],
    queryFn: () => fetchComplianceObligations(obligationParams),
  })
  const { data: rules = [], isLoading: isRuleLoading } = useQuery<ComplianceRule[]>({
    queryKey: ['complianceRules', ruleParams],
    queryFn: () => fetchComplianceRules(ruleParams),
  })
  const { data: checks = [], isLoading: isCheckLoading } = useQuery<ComplianceCheckRecord[]>({
    queryKey: ['complianceChecks', checkParams],
    queryFn: () => fetchComplianceChecks(checkParams),
  })
  const { data: llmUsage, isLoading: isUsageLoading } = useQuery<ComplianceLLMUsageResponse>({
    queryKey: ['complianceLlmUsage', usagePeriod],
    queryFn: () => fetchComplianceLLMUsage(usagePeriod),
  })
  const { data: scanHistory, isLoading: isScanHistoryLoading } = useQuery<ComplianceScanHistoryResponse>({
    queryKey: ['complianceScanHistory', scanPeriod],
    queryFn: () => fetchComplianceScanHistory(scanPeriod),
  })
  const { data: amendmentAlerts = [], isLoading: isAmendmentsLoading } = useQuery<ComplianceDocument[]>({
    queryKey: ['complianceAmendments'],
    queryFn: () => fetchComplianceAmendments(20),
  })

  const completeMut = useMutation({
    mutationFn: ({ id, by, note }: { id: number; by: string; note?: string }) =>
      completeComplianceObligation(id, { completed_by: by, evidence_note: note || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceDashboard'] })
      queryClient.invalidateQueries({ queryKey: ['complianceObligations'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-base'] })
      setTargetRow(null)
      setCompletedBy('')
      setEvidenceNote('')
      addToast('success', '의무 항목을 완료 처리했습니다.')
    },
  })

  const saveRuleMut = useMutation({
    mutationFn: (payload: ComplianceRuleCreateInput & { id?: number }) => {
      if (payload.id) {
        const { id, ...rest } = payload
        return updateComplianceRule(id, rest)
      }
      return createComplianceRule(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceRules'] })
      addToast('success', editingRuleId ? '규칙을 수정했습니다.' : '규칙을 생성했습니다.')
      setEditingRuleId(null)
      setRuleForm(emptyRuleForm)
      setConditionText(stringifyCondition(emptyRuleForm.condition))
    },
  })

  const deleteRuleMut = useMutation({
    mutationFn: (ruleId: number) => deleteComplianceRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceRules'] })
      addToast('success', '규칙을 삭제했습니다.')
    },
  })

  const manualCheckMut = useMutation({
    mutationFn: (selectedFundId: number) => runComplianceCheck(selectedFundId, 'manual'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['complianceDashboard'] })
      queryClient.invalidateQueries({ queryKey: ['complianceChecks'] })
      addToast('success', `수동 점검이 완료되었습니다. 점검 ${result.checked_count}건, 위반 ${result.failed_count}건`)
    },
  })

  const interpretMut = useMutation({
    mutationFn: (payload: { query: string; fund_id?: number | null }) => interpretComplianceQuery(payload),
    onSuccess: (result) => {
      setInterpretResult(result)
      queryClient.invalidateQueries({ queryKey: ['complianceLlmUsage'] })
      addToast('success', result.tier === 'L1' ? '규칙 엔진(L1)으로 답변했습니다.' : 'RAG + LLM(L2)으로 답변했습니다.')
    },
  })

  const manualScheduledScanMut = useMutation({
    mutationFn: (payload: { mode: 'daily' | 'full' | 'law'; fund_id?: number | null }) =>
      triggerComplianceManualScan(payload),
    onSuccess: (result) => {
      setManualScanResult(result)
      queryClient.invalidateQueries({ queryKey: ['complianceScanHistory'] })
      queryClient.invalidateQueries({ queryKey: ['complianceChecks'] })
      queryClient.invalidateQueries({ queryKey: ['complianceAmendments'] })
      queryClient.invalidateQueries({ queryKey: ['complianceDashboard'] })
      if (result.scan_type) {
        addToast('success', `수동 스캔 완료: ${result.scan_type}`)
      } else {
        addToast('success', '수동 법령 개정 점검이 완료되었습니다.')
      }
    },
  })

  const adhocNotice = obligations.find(
    (row) => row.rule_code?.startsWith('RPT-E') && row.status !== 'completed' && row.status !== 'waived',
  )

  function startCreateRule() {
    setEditingRuleId(null)
    setRuleForm(emptyRuleForm)
    setConditionText(stringifyCondition(emptyRuleForm.condition))
  }

  function startEditRule(rule: ComplianceRule) {
    setEditingRuleId(rule.id)
    setRuleForm({
      fund_id: rule.fund_id ?? undefined,
      document_id: rule.document_id ?? undefined,
      rule_code: rule.rule_code,
      rule_name: rule.rule_name,
      level: rule.level,
      category: rule.category,
      description: rule.description ?? undefined,
      condition: rule.condition,
      severity: rule.severity,
      auto_task: rule.auto_task,
      is_active: rule.is_active,
    })
    setConditionText(stringifyCondition(rule.condition))
  }

  function submitRule() {
    const condition = parseCondition(conditionText)
    if (!condition) {
      addToast('warning', '조건 JSON 형식이 올바르지 않습니다.')
      return
    }
    if (!ruleForm.rule_code.trim() || !ruleForm.rule_name.trim() || !ruleForm.category.trim()) {
      addToast('warning', 'rule_code, rule_name, category를 입력해주세요.')
      return
    }

    saveRuleMut.mutate({
      ...ruleForm,
      rule_code: ruleForm.rule_code.trim(),
      rule_name: ruleForm.rule_name.trim(),
      category: ruleForm.category.trim(),
      condition,
      id: editingRuleId ?? undefined,
    })
  }

  function runManualCheck() {
    if (ruleFundFilter === '') {
      addToast('warning', '수동 점검 전에 조합을 선택해주세요.')
      return
    }
    manualCheckMut.mutate(ruleFundFilter)
  }

  function submitLegalQuery() {
    const normalized = legalQuery.trim()
    if (!normalized) {
      addToast('warning', '법률 질의 내용을 입력해주세요.')
      return
    }
    interpretMut.mutate({
      query: normalized,
      fund_id: legalFundId === '' ? null : legalFundId,
    })
  }

  function runManualScheduledScan() {
    const payload: { mode: 'daily' | 'full' | 'law'; fund_id?: number | null } = {
      mode: manualScanMode,
    }
    if (manualScanMode === 'daily' && manualScanFundId !== '') {
      payload.fund_id = manualScanFundId
    }
    manualScheduledScanMut.mutate(payload)
  }

  function jumpToFundChecks(fundId: number) {
    setRuleFundFilter(fundId)
    setCheckResultFilter('fail')
    setActiveTab('checks')
  }

  function tabClass(tab: TabKey): string {
    return `rounded px-3 py-1 text-sm ${
      activeTab === tab ? 'primary-btn' : 'secondary-btn text-slate-700'
    }`
  }

  const usagePct = llmUsage?.usage_pct ?? 0
  const usageProgress = Math.max(0, Math.min(100, usagePct))
  const dashboardSummary = dashboard?.summary
  const dashboardFundStatus = (dashboard?.fund_status ?? []) as ComplianceDashboardFundStatusItem[]
  const dashboardRecentChecks = (dashboard?.recent_checks ?? []) as ComplianceDashboardRecentCheckItem[]
  const dashboardAmendments = (dashboard?.amendment_alerts ?? []) as ComplianceDashboardAmendmentAlert[]
  const dashboardDocumentStats = dashboard?.document_stats
  const dashboardLlmUsage = dashboard?.llm_usage

  const summaryRules = dashboardSummary?.total_rules ?? dashboard?.active_rule_count ?? dashboard?.rule_count ?? 0
  const summaryViolations = dashboardSummary?.active_violations ?? dashboard?.failed_check_count ?? 0
  const summaryWarnings = dashboardSummary?.warnings ?? 0
  const summaryPassed = dashboardSummary?.passed ?? 0
  const summaryRate =
    dashboardSummary?.compliance_rate ??
    (summaryPassed + summaryWarnings + summaryViolations > 0
      ? Number(((summaryPassed / Math.max(summaryPassed + summaryWarnings + summaryViolations, 1)) * 100).toFixed(1))
      : 0)
  const dashboardLlmUsageProgress = Math.max(0, Math.min(100, dashboardLlmUsage?.usage_rate ?? 0))

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">컴플라이언스</h2>
          <p className="page-subtitle">의무사항, 규칙, 점검, 법률 해석을 한 곳에서 관리합니다.</p>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">법률 질의</h3>
            <p className="mt-1 text-xs text-slate-500">L1 규칙 엔진을 우선 사용하고, 필요 시 L2 RAG + GPT 분석을 수행합니다.</p>
          </div>
          <span className={`tag ${interpretResult?.tier === 'L1' ? 'tag-green' : 'tag-indigo'}`}>
            {interpretResult?.tier ? `최근 답변: ${interpretResult.tier}` : '아직 답변이 없습니다'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <input
            className="form-input md:col-span-4"
            placeholder="예: 동일 발행인 집중투자가 현재 위반인지 알려줘"
            value={legalQuery}
            onChange={(event) => setLegalQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitLegalQuery()
            }}
          />
          <select
            className="form-input"
            value={legalFundId}
            onChange={(event) => setLegalFundId(event.target.value ? Number(event.target.value) : '')}
          >
            <option value="">조합 필터 없음</option>
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
          <button className="primary-btn" onClick={submitLegalQuery} disabled={interpretMut.isPending}>
            {interpretMut.isPending ? '질의 중...' : '질의'}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          조합을 선택하면 공통 법령(🌐) + 조합유형 가이드(📋) + 해당 조합 문서(🏢)까지 함께 검색합니다. 조합을 선택하지 않으면
          공통 법령만 검색합니다.
        </p>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white/70 p-3 lg:col-span-2">
            <p className="mb-1 text-xs font-semibold text-slate-600">답변</p>
            {interpretResult ? (
              <>
                <pre className="whitespace-pre-wrap text-sm text-slate-800">{interpretResult.answer}</pre>
                {interpretResult.sources.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-semibold text-slate-600">근거 문서</p>
                    {interpretResult.sources.map((source, idx) => {
                      const similarity =
                        source.distance == null || Number.isNaN(source.distance)
                          ? '-'
                          : Math.max(0, Math.min(1, 1 - source.distance)).toFixed(2)
                      const scope = scopeMeta(source.scope)
                      return (
                        <div
                          key={`${source.collection}-${idx}`}
                          className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px]">
                            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 ${scope.className}`}>
                              {scope.icon} {scope.label}
                            </span>
                            <span className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600">
                              [{source.collection}]
                            </span>
                            <span className="text-slate-500">
                              {source.article || '해당없음'} | 유사도 {similarity}
                            </span>
                          </div>
                          {source.title && <div className="font-medium text-slate-700">{source.title}</div>}
                          <div className="mt-0.5 text-slate-600">{source.text}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">질의를 입력하면 법률 해석 결과를 확인할 수 있습니다.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">토큰 사용량</p>
              <select
                className="form-input-sm w-auto"
                value={usagePeriod}
                onChange={(event) => setUsagePeriod(event.target.value as 'month' | 'week' | 'all')}
              >
                <option value="month">이번 달</option>
                <option value="week">최근 7일</option>
                <option value="all">전체</option>
              </select>
            </div>
            {isUsageLoading ? (
              <p className="text-xs text-slate-500">불러오는 중...</p>
            ) : (
              <div className="space-y-2 text-xs text-slate-700">
                <p>
                  사용: <span className="font-semibold">{(llmUsage?.used_tokens ?? 0).toLocaleString()}</span> 토큰
                </p>
                {llmUsage?.limit_tokens != null && (
                  <>
                    <p>
                      한도: <span className="font-semibold">{llmUsage.limit_tokens.toLocaleString()}</span> | 잔여:{' '}
                      <span className="font-semibold">{(llmUsage.remaining_tokens ?? 0).toLocaleString()}</span>
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          usageProgress >= 90 ? 'bg-red-500' : usageProgress >= 70 ? 'bg-amber-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${usageProgress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">사용률 {usageProgress.toFixed(1)}%</p>
                  </>
                )}
                <p>예상 비용: ${(llmUsage?.used_cost_usd ?? 0).toFixed(4)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-base">
        <div className="flex flex-wrap gap-2">
          <button className={tabClass('dashboard')} onClick={() => setActiveTab('dashboard')}>
            대시보드
          </button>
          <button className={tabClass('obligations')} onClick={() => setActiveTab('obligations')}>
            의무사항
          </button>
          <button className={tabClass('rules')} onClick={() => setActiveTab('rules')}>
            규칙
          </button>
          <button className={tabClass('checks')} onClick={() => setActiveTab('checks')}>
            점검
          </button>
          <button className={tabClass('documents')} onClick={() => setActiveTab('documents')}>
            문서 라이브러리
          </button>
          <button className={tabClass('schedule')} onClick={() => setActiveTab('schedule')}>
            스케줄/개정
          </button>
          <button className={tabClass('history')} onClick={() => setActiveTab('history')}>
            이력/리포트
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="card-base">
              <p className="text-xs text-slate-500">총 규칙 수</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">{summaryRules}</p>
            </div>
            <div className="card-base">
              <p className="text-xs text-slate-500">진행 중 위반</p>
              <p className="mt-1 text-xl font-semibold text-red-600">{summaryViolations}</p>
            </div>
            <div className="card-base">
              <p className="text-xs text-slate-500">경고</p>
              <p className="mt-1 text-xl font-semibold text-amber-600">{summaryWarnings}</p>
            </div>
            <div className="card-base">
              <p className="text-xs text-slate-500">적합</p>
              <p className="mt-1 text-xl font-semibold text-green-700">{summaryPassed}</p>
            </div>
            <div className="card-base">
              <p className="text-xs text-slate-500">준수율</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">{summaryRate.toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <FundComplianceGrid
              rows={dashboardFundStatus}
              isLoading={isDashboardLoading}
              selectedFundId={ruleFundFilter}
              onSelectFund={jumpToFundChecks}
            />
            <AuditTimeline rows={dashboardRecentChecks} isLoading={isDashboardLoading} maxItems={15} />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <AmendmentAlerts rows={dashboardAmendments} isLoading={isDashboardLoading} />

            <div className="card-base space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">인덱싱 및 LLM 사용량</h3>
                <p className="mt-1 text-xs text-slate-500">벡터 문서 청크 수와 월간 법률 LLM 사용량입니다.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                  <p className="text-slate-500">법률</p>
                  <p className="text-lg font-semibold text-slate-800">{dashboardDocumentStats?.laws ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                  <p className="text-slate-500">시행령/규칙</p>
                  <p className="text-lg font-semibold text-slate-800">{dashboardDocumentStats?.regulations ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                  <p className="text-slate-500">가이드라인</p>
                  <p className="text-lg font-semibold text-slate-800">{dashboardDocumentStats?.guidelines ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                  <p className="text-slate-500">규약/계약</p>
                  <p className="text-lg font-semibold text-slate-800">{dashboardDocumentStats?.agreements ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                  <p className="text-slate-500">내부지침</p>
                  <p className="text-lg font-semibold text-slate-800">{dashboardDocumentStats?.internal ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                  <p className="text-slate-500">총 청크 수</p>
                  <p className="text-lg font-semibold text-slate-800">{dashboardDocumentStats?.total_chunks ?? 0}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-700">월간 토큰 사용량</p>
                  <span className={dashboardLlmUsageProgress >= 90 ? 'tag tag-red' : dashboardLlmUsageProgress >= 70 ? 'tag tag-amber' : 'tag tag-blue'}>
                    {dashboardLlmUsageProgress.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-2">
                  {(dashboardLlmUsage?.month_total_tokens ?? 0).toLocaleString()} / {(dashboardLlmUsage?.month_limit ?? 0).toLocaleString()} 토큰
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      dashboardLlmUsageProgress >= 90
                        ? 'bg-red-500'
                        : dashboardLlmUsageProgress >= 70
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                    }`}
                    style={{ width: `${dashboardLlmUsageProgress}%` }}
                  />
                </div>
                <p className="mt-2">비용: ${(dashboardLlmUsage?.month_cost_usd ?? 0).toFixed(4)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'obligations' && (
        <>
          <div className="card-base">
            <p className="mb-2 text-xs font-semibold text-slate-600">조합 필터</p>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded px-2 py-1 text-xs ${
                  fundFilter === '' ? 'primary-btn' : 'secondary-btn text-slate-700'
                }`}
                onClick={() => setFundFilter('')}
              >
                전체
              </button>
              {funds.map((fund) => (
                <button
                  key={fund.id}
                  className={`rounded px-2 py-1 text-xs ${
                    fundFilter === fund.id ? 'primary-btn' : 'secondary-btn text-slate-700'
                  }`}
                  onClick={() => setFundFilter(fund.id)}
                >
                  {fund.name}
                </button>
              ))}
            </div>
          </div>

          <div className="card-base">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">상태</label>
                <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">전체</option>
                  <option value="pending">대기</option>
                  <option value="in_progress">진행중</option>
                  <option value="overdue">기한초과</option>
                  <option value="completed">완료</option>
                  <option value="waived">면제</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">카테고리</label>
                <select className="form-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="">전체</option>
                  <option value="reporting">보고</option>
                  <option value="investment_limit">투자한도</option>
                  <option value="impairment">손상</option>
                  <option value="asset_rating">자산평가</option>
                </select>
              </div>
            </div>
          </div>

          {adhocNotice && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              수시 보고 통지: {adhocNotice.rule_title} | 마감 {adhocNotice.due_date} ({dDayLabel(adhocNotice.d_day)})
            </div>
          )}

          <div className="card-base overflow-auto">
            {isObligationLoading ? (
              <PageLoading />
            ) : obligations.length === 0 ? (
              <EmptyState emoji="i" message="준수 의무 항목이 없습니다." className="py-8" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">상태</th>
                    <th className="px-3 py-2 text-left">마감일</th>
                    <th className="px-3 py-2 text-left">D-Day</th>
                    <th className="px-3 py-2 text-left">의무사항</th>
                    <th className="px-3 py-2 text-left">근거 조항</th>
                    <th className="px-3 py-2 text-left">대상 시스템</th>
                    <th className="px-3 py-2 text-left">조합</th>
                    <th className="px-3 py-2 text-left">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {obligations.map((row) => {
                    const badge = statusBadge(row)
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-2">
                          <span className={badge.className}>{badge.label}</span>
                        </td>
                        <td className="px-3 py-2">{row.due_date || '-'}</td>
                        <td className="px-3 py-2">{dDayLabel(row.d_day)}</td>
                        <td className="px-3 py-2">{row.rule_title || row.rule_code || '-'}</td>
                        <td className="px-3 py-2">{row.guideline_ref || '-'}</td>
                        <td className="px-3 py-2">{row.target_system || '-'}</td>
                        <td className="px-3 py-2">{row.fund_name || '-'}</td>
                        <td className="px-3 py-2">
                          {row.status === 'completed' || row.status === 'waived' ? (
                            <span className="text-xs text-slate-500">완료</span>
                          ) : (
                            <button className="secondary-btn btn-sm" onClick={() => setTargetRow(row)}>
                              완료 처리
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'rules' && (
        <>
          <div className="card-base">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">조합</label>
                <select
                  className="form-input"
                  value={ruleFundFilter}
                  onChange={(event) => setRuleFundFilter(event.target.value ? Number(event.target.value) : '')}
                >
                  <option value="">전체(공통+조합)</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">레벨</label>
                <select className="form-input" value={ruleLevelFilter} onChange={(event) => setRuleLevelFilter(event.target.value)}>
                  <option value="">전체</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                  <option value="L4">L4</option>
                  <option value="L5">L5</option>
                </select>
              </div>
              <div className="flex items-end gap-2 md:col-span-2">
                <button className="secondary-btn" onClick={startCreateRule}>
                  규칙 추가
                </button>
                <button className="primary-btn" onClick={runManualCheck} disabled={manualCheckMut.isPending || ruleFundFilter === ''}>
                  {manualCheckMut.isPending ? '실행 중...' : '수동 점검 실행'}
                </button>
              </div>
            </div>
          </div>

          <div className="card-base space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">{editingRuleId ? `규칙 수정 #${editingRuleId}` : '규칙 생성'}</p>
              {editingRuleId && (
                <button className="text-xs text-slate-500 hover:text-slate-700" onClick={startCreateRule}>
                  취소
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                className="form-input"
                placeholder="rule_code (예: INV-LIMIT-001)"
                value={ruleForm.rule_code}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, rule_code: event.target.value }))}
              />
              <input
                className="form-input"
                placeholder="규칙명"
                value={ruleForm.rule_name}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, rule_name: event.target.value }))}
              />
              <select
                className="form-input"
                value={ruleForm.level}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, level: event.target.value }))}
              >
                <option value="L1">L1</option>
                <option value="L2">L2</option>
                <option value="L3">L3</option>
                <option value="L4">L4</option>
                <option value="L5">L5</option>
              </select>
              <input
                className="form-input"
                placeholder="카테고리"
                value={ruleForm.category}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, category: event.target.value }))}
              />
              <select
                className="form-input"
                value={ruleForm.severity}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, severity: event.target.value }))}
              >
                <option value="info">정보</option>
                <option value="warning">경고</option>
                <option value="error">오류</option>
                <option value="critical">치명</option>
              </select>
              <select
                className="form-input"
                value={ruleForm.auto_task ? 'true' : 'false'}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, auto_task: event.target.value === 'true' }))}
              >
                <option value="false">자동업무: 비활성</option>
                <option value="true">자동업무: 활성</option>
              </select>
              <textarea className="form-input md:col-span-2" rows={8} value={conditionText} onChange={(event) => setConditionText(event.target.value)} />
              <input
                className="form-input md:col-span-2"
                placeholder="설명"
                value={ruleForm.description ?? ''}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>

            <div>
              <button className="primary-btn" onClick={submitRule} disabled={saveRuleMut.isPending}>
                {saveRuleMut.isPending ? '저장 중...' : editingRuleId ? '규칙 수정' : '규칙 생성'}
              </button>
            </div>
          </div>

          <div className="card-base overflow-auto">
            {isRuleLoading ? (
              <PageLoading />
            ) : rules.length === 0 ? (
              <EmptyState emoji="r" message="규칙이 없습니다." className="py-8" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">코드</th>
                    <th className="px-3 py-2 text-left">이름</th>
                    <th className="px-3 py-2 text-left">레벨</th>
                    <th className="px-3 py-2 text-left">카테고리</th>
                    <th className="px-3 py-2 text-left">심각도</th>
                    <th className="px-3 py-2 text-left">자동 업무</th>
                    <th className="px-3 py-2 text-left">활성</th>
                    <th className="px-3 py-2 text-left">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-3 py-2 font-mono text-xs">{rule.rule_code}</td>
                      <td className="px-3 py-2">{rule.rule_name}</td>
                      <td className="px-3 py-2">{rule.level}</td>
                      <td className="px-3 py-2">{rule.category}</td>
                      <td className="px-3 py-2">{rule.severity}</td>
                      <td className="px-3 py-2">{rule.auto_task ? '예' : '아니오'}</td>
                      <td className="px-3 py-2">{rule.is_active ? '예' : '아니오'}</td>
                      <td className="px-3 py-2 space-x-2">
                        <button className="secondary-btn btn-sm" onClick={() => startEditRule(rule)}>
                          수정
                        </button>
                        <button
                          className="secondary-btn btn-sm"
                          disabled={deleteRuleMut.isPending}
                          onClick={() => deleteRuleMut.mutate(rule.id)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'checks' && (
        <>
          <div className="card-base">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">조합</label>
                <select
                  className="form-input"
                  value={ruleFundFilter}
                  onChange={(event) => setRuleFundFilter(event.target.value ? Number(event.target.value) : '')}
                >
                  <option value="">전체</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">결과</label>
                <select className="form-input" value={checkResultFilter} onChange={(event) => setCheckResultFilter(event.target.value)}>
                  <option value="">전체</option>
                  <option value="pass">적합</option>
                  <option value="warning">경고</option>
                  <option value="fail">위반</option>
                  <option value="error">오류</option>
                </select>
              </div>
              <div className="flex items-end md:col-span-2">
                <button className="primary-btn" onClick={runManualCheck} disabled={manualCheckMut.isPending || ruleFundFilter === ''}>
                  {manualCheckMut.isPending ? '실행 중...' : '수동 점검 실행'}
                </button>
              </div>
            </div>
          </div>

          <div className="card-base overflow-auto">
            {isCheckLoading ? (
              <PageLoading />
            ) : checks.length === 0 ? (
              <EmptyState emoji="c" message="점검 기록이 없습니다." className="py-8" />
            ) : (
              <table className="min-w-[1180px] w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">점검 시각</th>
                    <th className="px-3 py-2 text-left">조합</th>
                    <th className="px-3 py-2 text-left">규칙</th>
                    <th className="px-3 py-2 text-left">레벨</th>
                    <th className="px-3 py-2 text-left">결과</th>
                    <th className="px-3 py-2 text-left">상세</th>
                    <th className="px-3 py-2 text-left">트리거</th>
                    <th className="px-3 py-2 text-left">시정조치 업무</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {checks.map((check) => {
                    const badge = checkBadge(check.result)
                    return (
                      <tr key={check.id}>
                        <td className="px-3 py-2">{check.checked_at ? new Date(check.checked_at).toLocaleString() : '-'}</td>
                        <td className="px-3 py-2">{check.fund_name || `#${check.fund_id}`}</td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs text-slate-500">{check.rule_code || '-'}</div>
                          <div>{check.rule_name || '-'}</div>
                        </td>
                        <td className="px-3 py-2">{check.level || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={badge.className}>{badge.label}</span>
                        </td>
                        <td className="px-3 py-2 max-w-[380px] truncate" title={check.detail || ''}>
                          {check.detail || '-'}
                        </td>
                        <td className="px-3 py-2">
                          <div>{check.trigger_type || '-'}</div>
                          <div className="text-xs text-slate-500">{check.trigger_source || '-'}</div>
                        </td>
                        <td className="px-3 py-2">
                          {check.remediation_task_id ? (
                            <span className="text-xs">
                              #{check.remediation_task_id} {check.remediation_task_title || ''}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-3">
          <div className="card-base space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">정기 준수 점검 스케줄</h3>
              <select
                className="form-input-sm w-auto"
                value={scanPeriod}
                onChange={(event) => setScanPeriod(event.target.value as 'week' | 'month' | 'all')}
              >
                <option value="week">최근 7일</option>
                <option value="month">최근 30일</option>
                <option value="all">전체</option>
              </select>
            </div>
            {isScanHistoryLoading ? (
              <PageLoading />
            ) : !scanHistory?.schedules?.length ? (
              <EmptyState emoji="s" message="스케줄러 설정이 없습니다." className="py-6" />
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                {scanHistory.schedules.map((job) => (
                  <div key={job.job_id} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{job.label}</p>
                      <span className={`tag ${job.enabled ? 'tag-green' : 'tag-gray'}`}>{job.enabled ? '활성' : '비활성'}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{job.cron}</p>
                    <p className="mt-2 text-xs text-slate-600">다음 실행: {job.next_run_at ? new Date(job.next_run_at).toLocaleString() : '-'}</p>
                    <p className="text-xs text-slate-600">최근 실행: {job.last_run_at ? new Date(job.last_run_at).toLocaleString() : '-'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-base space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">수동 스캔</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select
                className="form-input"
                value={manualScanMode}
                onChange={(event) => setManualScanMode(event.target.value as 'daily' | 'full' | 'law')}
              >
                <option value="daily">일간 범위 (L1-L3)</option>
                <option value="full">월간 전체 감사 (L1-L5)</option>
                <option value="law">법령 개정 점검</option>
              </select>
              <select
                className="form-input"
                value={manualScanFundId}
                onChange={(event) => setManualScanFundId(event.target.value ? Number(event.target.value) : '')}
                disabled={manualScanMode !== 'daily'}
              >
                <option value="">전체 조합</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
              <button className="primary-btn md:col-span-2" onClick={runManualScheduledScan} disabled={manualScheduledScanMut.isPending}>
                {manualScheduledScanMut.isPending ? '실행 중...' : '수동 스캔 실행'}
              </button>
            </div>
            {manualScanResult && (
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-700">
                {manualScanResult.scan_type ? (
                  <div className="space-y-1">
                    <p>
                      유형: <span className="font-semibold">{manualScanResult.scan_type}</span>
                    </p>
                    <p>
                      규칙: <span className="font-semibold">{manualScanResult.total_rules ?? 0}</span> | 적합{' '}
                      <span className="font-semibold text-green-700">{manualScanResult.passed ?? 0}</span> | 경고{' '}
                      <span className="font-semibold text-amber-700">{manualScanResult.warnings ?? 0}</span> | 위반{' '}
                      <span className="font-semibold text-red-700">{manualScanResult.failed ?? 0}</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p>
                      개정 감지: <span className="font-semibold">{manualScanResult.count ?? 0}</span>
                    </p>
                    <p>
                      신규 저장 알림: <span className="font-semibold">{manualScanResult.saved_count ?? 0}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card-base overflow-auto">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">최근 스캔 이력</h3>
              <span className="text-xs text-slate-500">{scanHistory?.period ?? scanPeriod}</span>
            </div>
            {isScanHistoryLoading ? (
              <PageLoading />
            ) : !scanHistory?.history?.length ? (
              <EmptyState emoji="h" message="스캔 이력이 없습니다." className="py-6" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">스캔</th>
                    <th className="px-3 py-2 text-left">일자</th>
                    <th className="px-3 py-2 text-left">조합 수</th>
                    <th className="px-3 py-2 text-left">점검 수</th>
                    <th className="px-3 py-2 text-left">적합</th>
                    <th className="px-3 py-2 text-left">경고</th>
                    <th className="px-3 py-2 text-left">위반</th>
                    <th className="px-3 py-2 text-left">최근 실행</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {scanHistory.history.map((row) => (
                    <tr key={`${row.scan_type}-${row.scan_date}-${row.last_checked_at}`}>
                      <td className="px-3 py-2">{row.scan_type}</td>
                      <td className="px-3 py-2">{row.scan_date}</td>
                      <td className="px-3 py-2">{row.fund_count}</td>
                      <td className="px-3 py-2">{row.checked_count}</td>
                      <td className="px-3 py-2 text-green-700">{row.pass_count}</td>
                      <td className="px-3 py-2 text-amber-700">{row.warning_count}</td>
                      <td className="px-3 py-2 text-red-700">{row.failed_count}</td>
                      <td className="px-3 py-2">{new Date(row.last_checked_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card-base overflow-auto">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">법령 개정 알림</h3>
            {isAmendmentsLoading ? (
              <PageLoading />
            ) : amendmentAlerts.length === 0 ? (
              <EmptyState emoji="a" message="아직 법령 개정 알림이 없습니다." className="py-6" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">제목</th>
                    <th className="px-3 py-2 text-left">시행일</th>
                    <th className="px-3 py-2 text-left">버전</th>
                    <th className="px-3 py-2 text-left">요약</th>
                    <th className="px-3 py-2 text-left">생성일</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {amendmentAlerts.map((alert) => (
                    <tr key={alert.id}>
                      <td className="px-3 py-2">{alert.title}</td>
                      <td className="px-3 py-2">{alert.effective_date ? new Date(alert.effective_date).toLocaleDateString() : '-'}</td>
                      <td className="px-3 py-2">{alert.version || '-'}</td>
                      <td className="px-3 py-2">{alert.content_summary || '-'}</td>
                      <td className="px-3 py-2">{alert.created_at ? new Date(alert.created_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          <div className="card-base">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">조합</label>
                <select
                  className="form-input"
                  value={historyFundId}
                  onChange={(event) => setHistoryFundId(event.target.value ? Number(event.target.value) : '')}
                >
                  <option value="">전체 조합 (제안/시정조치 포함)</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">패턴 분석 기간</label>
                <select
                  className="form-input"
                  value={patternMonths}
                  onChange={(event) => setPatternMonths(Number(event.target.value))}
                >
                  <option value={3}>최근 3개월</option>
                  <option value={6}>최근 6개월</option>
                  <option value={12}>최근 12개월</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">리포트 월</label>
                <input
                  className="form-input"
                  type="month"
                  value={reportYearMonth}
                  onChange={(event) => setReportYearMonth(event.target.value)}
                />
              </div>
            </div>
          </div>

          <ViolationPatterns fundId={historyFundId} months={patternMonths} />
          <RuleSuggestions fundId={historyFundId} />
          <RemediationTracker fundId={historyFundId} />
          <MonthlyReport fundId={historyFundId} yearMonth={reportYearMonth} />
        </div>
      )}

      {activeTab === 'documents' && <DocumentLibrary funds={funds} />}

      {targetRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-slate-900">의무사항 완료 처리</h3>
            <p className="mb-3 text-xs text-slate-500">
              {targetRow.rule_title || targetRow.rule_code || '-'} | 마감 {targetRow.due_date || '-'}
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">완료자</label>
                <input className="form-input" value={completedBy} onChange={(event) => setCompletedBy(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">근거 메모</label>
                <textarea className="form-input" rows={3} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="secondary-btn" onClick={() => setTargetRow(null)}>
                취소
              </button>
              <button
                className="primary-btn"
                disabled={completeMut.isPending || !completedBy.trim()}
                onClick={() =>
                  completeMut.mutate({
                    id: targetRow.id,
                    by: completedBy.trim(),
                    note: evidenceNote.trim(),
                  })
                }
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




