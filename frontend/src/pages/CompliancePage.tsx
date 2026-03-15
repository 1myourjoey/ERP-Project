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
  fetchComplianceOfficerBrief,
  fetchComplianceReviews,
  fetchComplianceRules,
  fetchComplianceScanHistory,
  fetchFunds,
  fetchInvestments,
  interpretComplianceQuery,
  runComplianceReview,
  runComplianceCheck,
  triggerComplianceManualScan,
  updateComplianceRule,
  type ComplianceDashboardAmendmentAlert,
  type ComplianceDashboardFundStatusItem,
  type ComplianceDashboardRecentCheckItem,
  type ComplianceCheckRecord,
  type ComplianceDashboardSummary,
  type ComplianceDocument,
  type ComplianceOfficerBrief,
  type ComplianceInterpretResponse,
  type ComplianceLLMUsageResponse,
  type ComplianceManualScanResponse,
  type ComplianceObligation,
  type ComplianceReview,
  type ComplianceReviewRunResponse,
  type ComplianceRule,
  type ComplianceRuleCreateInput,
  type ComplianceScanHistoryResponse,
  type Fund,
  type Investment,
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
import PageControlStrip from '../components/common/page/PageControlStrip'
import PageHeader from '../components/common/page/PageHeader'
import PageMetricStrip from '../components/common/page/PageMetricStrip'
import SectionScaffold from '../components/common/page/SectionScaffold'
import { queryKeys } from '../lib/queryKeys'

type TabKey = 'dashboard' | 'obligations' | 'rules' | 'checks' | 'documents' | 'schedule' | 'history'

const COMPLIANCE_TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: '오늘 해야 할 일' },
  { key: 'obligations', label: '의무와 마감' },
  { key: 'rules', label: '검토 기준' },
  { key: 'checks', label: '검토 결과' },
  { key: 'documents', label: '문서 기준' },
  { key: 'schedule', label: '정기 점검' },
  { key: 'history', label: '이력과 리포트' },
]

function reviewBadge(result: string): { label: string; className: string } {
  if (result === 'pass') return { label: '문제 없음', className: 'tag tag-green' }
  if (result === 'warn') return { label: '주의', className: 'tag tag-amber' }
  if (result === 'fail') return { label: '위반 우려', className: 'tag tag-red' }
  if (result === 'conflict') return { label: '문서 충돌', className: 'tag tag-red' }
  if (result === 'needs_review') return { label: '추가 검토 필요', className: 'tag tag-blue' }
  return { label: result, className: 'tag tag-gray' }
}

function levelPlainLabel(level: string | null | undefined): string {
  if (level === 'L1') return '기본 존재 확인'
  if (level === 'L2') return '수치 기준 확인'
  if (level === 'L3') return '기한 확인'
  if (level === 'L4') return '서로 맞는지 확인'
  if (level === 'L5') return '종합 판단'
  return level || '-'
}

function ruleTypePlainLabel(condition: Record<string, unknown> | null | undefined): string {
  const type = String(condition?.type || '').trim().toLowerCase()
  if (type === 'exists') return '존재 확인'
  if (type === 'range') return '수치 한도 확인'
  if (type === 'deadline') return '기한 확인'
  if (type === 'cross_validate') return '서로 맞는지 확인'
  if (type === 'composite') return '종합 판단'
  return '기타 기준'
}

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

function scopeMeta(scope?: string): { label: string; className: string } {
  if (scope === 'investment') {
    return {
      label: '투자계약',
      className: 'border-[#d2c3ff] bg-[#f5f0ff] text-[#50338a]',
    }
  }
  if (scope === 'fund_type') {
    return {
      label: '유형 가이드',
      className: 'border-[#c5d8fb] bg-[#edf3ff] text-[#1a3660]',
    }
  }
  if (scope === 'fund') {
    return {
      label: '조합 문서',
      className: 'border-[#d4a418] bg-[#fff7d6] text-[#624100]',
    }
  }
  return {
    label: '공통 법령',
    className: 'border-[#d8e5fb] bg-[#f5f9ff] text-[#0f1f3d]',
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

const RULE_CONDITION_PRESETS: Record<string, Record<string, unknown>> = {
  exists: { type: 'exists', target: 'document', document_type: '' },
  range: { type: 'range', target: 'investment_ratio', max: 0.2 },
  deadline: { type: 'deadline', target: 'quarterly_report', days_before: 7 },
  cross_validate: { type: 'cross_validate', source: 'lp_commitment_sum', target: 'fund_commitment_total', tolerance: 0 },
  composite: { type: 'composite', logic: 'AND', rules: [] },
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
  const [showAdvancedRuleEditor, setShowAdvancedRuleEditor] = useState(false)

  const [legalQuery, setLegalQuery] = useState('')
  const [legalFundId, setLegalFundId] = useState<number | ''>('')
  const [legalInvestmentId, setLegalInvestmentId] = useState<number | ''>('')
  const [reviewScenario, setReviewScenario] = useState<'investment_precheck' | 'report_precheck' | 'fund_document_check'>('investment_precheck')
  const [usagePeriod, setUsagePeriod] = useState<'month' | 'week' | 'all'>('month')
  const [interpretResult, setInterpretResult] = useState<ComplianceInterpretResponse | null>(null)
  const [reviewResult, setReviewResult] = useState<ComplianceReviewRunResponse | null>(null)

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
  const { data: legalInvestments = [] } = useQuery<Investment[]>({
    queryKey: ['investments', { fund_id: legalFundId === '' ? undefined : legalFundId }],
    queryFn: () => fetchInvestments({ fund_id: legalFundId === '' ? undefined : legalFundId }),
    enabled: legalFundId !== '',
  })
  const { data: officerBrief, isLoading: isOfficerBriefLoading } = useQuery<ComplianceOfficerBrief>({
    queryKey: ['complianceOfficerBrief', legalFundId],
    queryFn: () => fetchComplianceOfficerBrief(Number(legalFundId)),
    enabled: legalFundId !== '',
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
  const { data: recentReviews = [] } = useQuery<ComplianceReview[]>({
    queryKey: ['complianceReviews', { fund_id: legalFundId === '' ? undefined : legalFundId, investment_id: legalInvestmentId === '' ? undefined : legalInvestmentId }],
    queryFn: () =>
      fetchComplianceReviews({
        fund_id: legalFundId === '' ? undefined : legalFundId,
        investment_id: legalInvestmentId === '' ? undefined : legalInvestmentId,
        limit: 10,
      }),
    enabled: legalFundId !== '',
  })

  const completeMut = useMutation({
    mutationFn: ({ id, by, note }: { id: number; by: string; note?: string }) =>
      completeComplianceObligation(id, { completed_by: by, evidence_note: note || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceDashboard'] })
      queryClient.invalidateQueries({ queryKey: ['complianceObligations'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.base })
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
      addToast('success', `다시 확인이 완료되었습니다. 확인 ${result.checked_count}건, 위반 우려 ${result.failed_count}건`)
    },
  })

  const interpretMut = useMutation({
    mutationFn: (payload: { query: string; fund_id?: number | null; investment_id?: number | null }) => interpretComplianceQuery(payload),
    onSuccess: (result) => {
      setInterpretResult(result)
      queryClient.invalidateQueries({ queryKey: ['complianceLlmUsage'] })
      addToast('success', result.tier === 'L1' ? '등록된 규칙 기준으로 설명했습니다.' : '문서 근거까지 반영해 설명했습니다.')
    },
  })

  const reviewMut = useMutation({
    mutationFn: (payload: {
      fund_id: number
      scenario: string
      query?: string | null
      investment_id?: number | null
      run_rule_engine?: boolean
    }) => runComplianceReview(payload),
    onSuccess: (result) => {
      setReviewResult(result)
      queryClient.invalidateQueries({ queryKey: ['complianceReviews'] })
      queryClient.invalidateQueries({ queryKey: ['complianceChecks'] })
      addToast('success', `계층 검증 완료: ${result.review.result}`)
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

  const editableCondition = useMemo<Record<string, unknown>>(
    () => parseCondition(conditionText) ?? ruleForm.condition,
    [conditionText, ruleForm.condition],
  )

  function replaceConditionDraft(next: Record<string, unknown>) {
    setConditionText(stringifyCondition(next))
  }

  function updateConditionField(key: string, value: unknown) {
    replaceConditionDraft({ ...editableCondition, [key]: value })
  }

  function startCreateRule() {
    setEditingRuleId(null)
    setRuleForm(emptyRuleForm)
    setConditionText(stringifyCondition(emptyRuleForm.condition))
    setShowAdvancedRuleEditor(false)
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
    setShowAdvancedRuleEditor(false)
  }

  function submitRule() {
    const condition = showAdvancedRuleEditor ? parseCondition(conditionText) : editableCondition
    if (!condition) {
      addToast('warning', '조건 JSON 형식이 올바르지 않습니다.')
      return
    }
    if (!ruleForm.rule_name.trim() || !ruleForm.category.trim()) {
      addToast('warning', '검토 기준 이름과 카테고리를 입력해주세요.')
      return
    }

    const nextRuleCode = ruleForm.rule_code.trim() || `RULE-${Date.now()}`

    saveRuleMut.mutate({
      ...ruleForm,
      rule_code: nextRuleCode,
      rule_name: ruleForm.rule_name.trim(),
      category: ruleForm.category.trim(),
      condition,
      id: editingRuleId ?? undefined,
    })
  }

  function runManualCheck() {
    if (ruleFundFilter === '') {
      addToast('warning', '다시 확인할 조합을 선택해주세요.')
      return
    }
    manualCheckMut.mutate(ruleFundFilter)
  }

  function submitLegalQuery() {
    const normalized = legalQuery.trim()
    if (!normalized) {
      addToast('warning', '검토할 내용을 입력해주세요.')
      return
    }
    interpretMut.mutate({
      query: normalized,
      fund_id: legalFundId === '' ? null : legalFundId,
      investment_id: legalInvestmentId === '' ? null : legalInvestmentId,
    })
  }

  function submitComplianceReview() {
    if (legalFundId === '') {
      addToast('warning', '우선순위 검토 전에 조합을 선택해주세요.')
      return
    }
    if (reviewScenario === 'investment_precheck' && legalInvestmentId === '') {
      addToast('warning', '투자 실행 검증은 투자건 선택이 필요합니다.')
      return
    }
    reviewMut.mutate({
      fund_id: legalFundId,
      scenario: reviewScenario,
      query: legalQuery.trim() || null,
      investment_id: legalInvestmentId === '' ? null : legalInvestmentId,
      run_rule_engine: true,
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

  function jumpToCheckResult(result: 'fail' | 'warning') {
    setCheckResultFilter(result)
    setActiveTab('checks')
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
  const activeTabLabel = COMPLIANCE_TABS.find((item) => item.key === activeTab)?.label ?? '대시보드'
  const complianceMetrics = [
    {
      label: '총 규칙 수',
      value: `${summaryRules}`,
      hint: '활성 기준 컴플라이언스 룰',
    },
    {
      label: '진행 중 위반',
      value: `${summaryViolations}`,
      hint: '즉시 조치가 필요한 항목',
      tone: summaryViolations > 0 ? 'danger' : 'default',
      interactive: true,
      onClick: () => jumpToCheckResult('fail'),
      ariaLabel: '진행 중 위반 점검 결과로 이동',
    },
    {
      label: '경고',
      value: `${summaryWarnings}`,
      hint: '주의 관찰 대상',
      tone: summaryWarnings > 0 ? 'warning' : 'default',
      interactive: true,
      onClick: () => jumpToCheckResult('warning'),
      ariaLabel: '경고 점검 결과로 이동',
    },
    {
      label: '준수율',
      value: `${summaryRate.toFixed(1)}%`,
      hint: `적합 ${summaryPassed}건`,
      tone: summaryRate >= 90 ? 'success' : summaryRate >= 75 ? 'info' : 'warning',
    },
  ] as const

  return (
    <div className="page-container space-y-4">
      <PageHeader
        title="컴플라이언스"
        subtitle="준법감시 관점에서 오늘 해야 할 일, 문서 충돌, 통지 일정, 검토 결과를 한 화면에서 봅니다."
        meta={(
          <span className="rounded-full border border-[#d8e5fb] bg-[#f5f9ff] px-2.5 py-1 text-[11px] font-semibold text-[#64748b]">
            {activeTabLabel}
          </span>
        )}
      />

      <PageMetricStrip items={[...complianceMetrics]} columns={4} />

      <SectionScaffold
        title="법령·규약·계약서 검토"
        description="질문하면 먼저 등록된 규칙을 보고, 부족하면 공통 법령·조합 규약·투자계약서를 찾아 근거와 함께 설명합니다."
        actions={(
          <span className={`tag ${interpretResult?.tier === 'L1' ? 'tag-green' : 'tag-indigo'}`}>
            {interpretResult?.tier
              ? `최근 설명: ${interpretResult.tier === 'L1' ? '등록 규칙 기준' : '문서 근거 포함'}`
              : '검토 대기'}
          </span>
        )}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-[#d8e5fb] bg-[#f8fbff] p-3">
            <p className="text-xs font-semibold text-[#1a3660]">1. 등록된 규칙 먼저 확인</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">
              이미 등록된 컴플라이언스 규칙과 최근 점검 결과를 먼저 확인합니다. 여기서 답이 분명하면 바로 설명합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#d8e5fb] bg-white p-3">
            <p className="text-xs font-semibold text-[#1a3660]">2. 관련 문서 찾기</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">
              공통 법령, 해당 조합 규약, 해당 투자건 계약서를 우선순위대로 찾아 근거가 되는 조항을 추립니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#d8e5fb] bg-white p-3">
            <p className="text-xs font-semibold text-[#1a3660]">3. 근거를 바탕으로 설명</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">
              찾은 조항을 바탕으로 허용 여부와 주의사항을 설명합니다. 아래에서 어떤 문서가 근거인지 바로 확인할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-7 md:gap-4">
          <input
            className="form-input md:col-span-3"
            placeholder="예: 이 투자 실행이 규약과 계약서 기준으로 가능한지 알려줘"
            value={legalQuery}
            onChange={(event) => setLegalQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitLegalQuery()
            }}
          />
          <select
            className="form-input"
            value={legalFundId}
            onChange={(event) => {
              setLegalFundId(event.target.value ? Number(event.target.value) : '')
              setLegalInvestmentId('')
            }}
          >
            <option value="">조합 선택 안 함</option>
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
          <select
            className="form-input"
            value={legalInvestmentId}
            onChange={(event) => setLegalInvestmentId(event.target.value ? Number(event.target.value) : '')}
            disabled={legalFundId === ''}
          >
            <option value="">투자건 선택 안 함</option>
            {legalInvestments.map((investment) => (
              <option key={investment.id} value={investment.id}>
                {investment.company_name || `투자건 #${investment.id}`}
              </option>
            ))}
          </select>
          <select
            className="form-input"
            value={reviewScenario}
            onChange={(event) => setReviewScenario(event.target.value as 'investment_precheck' | 'report_precheck' | 'fund_document_check')}
          >
            <option value="investment_precheck">투자 실행 검증</option>
            <option value="report_precheck">보고 전 검증</option>
            <option value="fund_document_check">문서 변경 검증</option>
          </select>
          <button className="primary-btn" onClick={submitLegalQuery} disabled={interpretMut.isPending}>
            {interpretMut.isPending ? '설명 정리 중...' : '설명 받기'}
          </button>
          <button className="secondary-btn" onClick={submitComplianceReview} disabled={reviewMut.isPending}>
            {reviewMut.isPending ? '우선순위 검토 중...' : '우선순위 검토'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[#64748b]">
          `설명 받기`는 빠르게 해석을 보여주고, `우선순위 검토`는 `법령 → 조합 규약 → 투자계약서` 순서로 근거를 모아 검토 이력을 남깁니다.
        </p>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3 lg:col-span-2">
            <p className="mb-1 text-xs font-semibold text-[#64748b]">설명 결과</p>
            {interpretResult ? (
              <>
                <pre className="whitespace-pre-wrap text-sm text-[#0f1f3d]">{interpretResult.answer}</pre>
                {interpretResult.sources.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-semibold text-[#64748b]">근거 문서</p>
                    {interpretResult.sources.map((source, idx) => {
                      const similarity =
                        source.distance == null || Number.isNaN(source.distance)
                          ? '-'
                          : Math.max(0, Math.min(1, 1 - source.distance)).toFixed(2)
                      const scope = scopeMeta(source.scope)
                      return (
                        <div
                          key={`${source.collection}-${idx}`}
                          className="rounded-lg border border-[#e6eefc] bg-[#f5f9ff] px-2 py-1.5 text-xs text-[#0f1f3d]"
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px]">
                            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 ${scope.className}`}>
                              {scope.label}
                            </span>
                            <span className="inline-flex items-center rounded border border-[#d8e5fb] bg-white px-1.5 py-0.5 text-[#64748b]">
                              [{source.collection}]
                            </span>
                            <span className="text-[#64748b]">
                              {source.article || '해당없음'} | 유사도 {similarity}
                            </span>
                          </div>
                          {source.title && <div className="font-medium text-[#0f1f3d]">{source.title}</div>}
                          <div className="mt-0.5 text-[#64748b]">{source.text}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[#64748b]">질문을 입력하면 관련 법령, 규약, 계약서를 바탕으로 설명을 확인할 수 있습니다.</p>
            )}
          </div>

          <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
            <div className="mb-3 rounded-xl border border-[#d8e5fb] bg-[#f8fbff] p-3 text-xs text-[#0f1f3d]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold text-[#1a3660]">최근 우선순위 검토</p>
                {reviewResult?.review && (
                  <span className="tag tag-indigo">{reviewResult.review.result}</span>
                )}
              </div>
              {reviewResult?.review ? (
                <div className="space-y-2">
                  <p className="font-medium text-[#0f1f3d]">{reviewResult.review.summary || '요약 없음'}</p>
                  <p className="text-[#64748b]">
                    우선 문서 계층: <span className="font-semibold">{reviewResult.review.prevailing_tier || '미정'}</span>
                  </p>
                  {reviewResult.review.evidence.length > 0 && (
                    <div className="space-y-1">
                      {reviewResult.review.evidence.slice(0, 3).map((evidence) => (
                        <div key={evidence.id} className="rounded border border-[#e6eefc] bg-white px-2 py-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{evidence.source_tier}</span>
                            <span className="text-[#64748b]">{evidence.section_ref || `p.${evidence.page_no ?? '-'}`}</span>
                          </div>
                          <div className="mt-1 line-clamp-3 text-[#64748b]">{evidence.snippet}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[#64748b]">아직 우선순위 검토를 실행하지 않았습니다.</p>
              )}
              {recentReviews.length > 0 && (
                <div className="mt-3 border-t border-[#e6eefc] pt-2">
                  <p className="mb-1 font-semibold text-[#64748b]">최근 이력</p>
                  <div className="space-y-1">
                    {recentReviews.slice(0, 3).map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 rounded border border-[#eef4ff] bg-white px-2 py-1">
                        <span className="truncate">{row.scenario}</span>
                        <span className="tag tag-blue">{row.result}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#64748b]">토큰 사용량</p>
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
              <p className="text-xs text-[#64748b]">불러오는 중...</p>
            ) : (
              <div className="space-y-2 text-xs text-[#0f1f3d]">
                <p>
                  사용: <span className="font-semibold">{(llmUsage?.used_tokens ?? 0).toLocaleString()}</span> 토큰
                </p>
                {llmUsage?.limit_tokens != null && (
                  <>
                    <p>
                      한도: <span className="font-semibold">{llmUsage.limit_tokens.toLocaleString()}</span> | 잔여:{' '}
                      <span className="font-semibold">{(llmUsage.remaining_tokens ?? 0).toLocaleString()}</span>
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f5f9ff]">
                      <div
                        className={`h-full rounded-full ${
                          usageProgress >= 90 ? 'bg-[#6d3e44]' : usageProgress >= 70 ? 'bg-[#b68a00]' : 'bg-[#558ef8]'
                        }`}
                        style={{ width: `${usageProgress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#64748b]">사용률 {usageProgress.toFixed(1)}%</p>
                  </>
                )}
                <p>예상 비용: ${(llmUsage?.used_cost_usd ?? 0).toFixed(4)}</p>
              </div>
            )}
          </div>
        </div>
      </SectionScaffold>

      <PageControlStrip compact>
        <div className="segmented-control w-full overflow-x-auto">
          {COMPLIANCE_TABS.map((item) => (
            <button
              key={item.key}
              className={`tab-btn min-w-fit px-4 py-2 text-sm ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => setActiveTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </PageControlStrip>

      {activeTab === 'dashboard' && (
        <div className="space-y-3">
          <div className="card-base">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[260px] flex-1">
                <label className="mb-1 block text-xs font-medium text-[#64748b]">준법감시 대상 조합</label>
                <select
                  className="form-input"
                  value={legalFundId}
                  onChange={(event) => {
                    setLegalFundId(event.target.value ? Number(event.target.value) : '')
                    setLegalInvestmentId('')
                  }}
                >
                  <option value="">조합 선택</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-[#64748b]">
                조합을 선택하면 규약, 특별조합원 가이드라인, 투자계약서, 마감 일정, 최근 검토 결과를 한 번에 봅니다.
              </div>
            </div>
          </div>

          {legalFundId === '' ? (
            <div className="card-base">
              <EmptyState message="준법감시 관점으로 볼 조합을 선택해 주세요." className="py-10" />
            </div>
          ) : isOfficerBriefLoading || !officerBrief ? (
            <div className="card-base">
              <PageLoading />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                <div className="card-base">
                  <p className="text-xs text-[#64748b]">오늘 바로 확인</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{officerBrief.due_today_count}</p>
                </div>
                <div className="card-base">
                  <p className="text-xs text-[#64748b]">이번 주 마감</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{officerBrief.due_week_count}</p>
                </div>
                <div className="card-base">
                  <p className="text-xs text-[#64748b]">문서 충돌</p>
                  <p className="mt-2 text-2xl font-semibold text-red-700">{officerBrief.review_summary.conflict}</p>
                </div>
                <div className="card-base">
                  <p className="text-xs text-[#64748b]">추가 검토 필요</p>
                  <p className="mt-2 text-2xl font-semibold text-amber-700">{officerBrief.review_summary.needs_review}</p>
                </div>
                <div className="card-base">
                  <p className="text-xs text-[#64748b]">투자계약서 미등록</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f1f3d]">{officerBrief.missing_contracts.length}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div className="card-base">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">오늘 해야 할 일</h3>
                    <span className="text-xs text-[#64748b]">{officerBrief.required_today.length}건</span>
                  </div>
                  {!officerBrief.required_today.length ? (
                    <EmptyState message="오늘 바로 처리할 항목이 없습니다." className="py-8" />
                  ) : (
                    <div className="space-y-2">
                      {officerBrief.required_today.map((item, index) => (
                        <div key={`${item.kind}-${index}`} className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#0f1f3d]">{item.title}</p>
                            <span className={item.priority === 'high' ? 'tag tag-red' : 'tag tag-amber'}>
                              {item.priority === 'high' ? '우선 확인' : '확인 필요'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#64748b]">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card-base">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">오늘 통지하면 가능한 일정</h3>
                    <span className="text-xs text-[#64748b]">규약 기준</span>
                  </div>
                  <div className="space-y-2">
                    {officerBrief.notice_schedule.map((item) => (
                      <div key={item.notice_type} className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#0f1f3d]">{item.label}</p>
                          <span className="tag tag-blue">
                            {item.business_days}{item.day_basis === 'calendar' ? '일' : '영업일'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#64748b]">
                          오늘 통지 시 가장 빠른 기준일: {new Date(item.earliest_target_date).toLocaleDateString('ko-KR')}
                        </p>
                        {item.memo && <p className="mt-1 text-xs text-[#0f1f3d]">메모: {item.memo}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                <div className="card-base">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">문서 기준 현황</h3>
                    <span className="text-xs text-[#64748b]">업로드 기준</span>
                  </div>
                  <div className="space-y-2 text-sm text-[#0f1f3d]">
                    <div className="rounded-lg border border-[#d8e5fb] bg-white/70 px-3 py-2">조합 규약 {officerBrief.document_tiers.fund_bylaw ?? 0}건</div>
                    <div className="rounded-lg border border-[#d8e5fb] bg-white/70 px-3 py-2">특별조합원 가이드라인 {officerBrief.document_tiers.special_guideline ?? 0}건</div>
                    <div className="rounded-lg border border-[#d8e5fb] bg-white/70 px-3 py-2">투자계약서 {officerBrief.document_tiers.investment_contract ?? 0}건</div>
                    {officerBrief.special_partner_exists && (officerBrief.document_tiers.special_guideline ?? 0) === 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                        특별조합원이 있지만 관련 가이드라인이 아직 없습니다.
                      </div>
                    )}
                    {officerBrief.special_guidelines.length > 0 && (
                      <div className="rounded-lg border border-[#d8e5fb] bg-[#f8fbff] px-3 py-2 text-xs text-[#0f1f3d]">
                        <p className="font-semibold text-[#64748b]">등록된 특별조합원 가이드라인</p>
                        <div className="mt-1 space-y-1">
                          {officerBrief.special_guidelines.slice(0, 3).map((row) => (
                            <div key={row.id}>
                              {(row.document_role || '가이드라인')} · {row.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card-base">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">주요 계약/규약 포인트</h3>
                    <span className="text-xs text-[#64748b]">{officerBrief.key_terms.length}건</span>
                  </div>
                  {!officerBrief.key_terms.length ? (
                    <EmptyState message="등록된 주요 조항이 없습니다." className="py-8" />
                  ) : (
                    <div className="space-y-2">
                      {officerBrief.key_terms.slice(0, 6).map((term) => (
                        <div key={term.id} className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                          <p className="text-xs text-[#64748b]">{term.category}</p>
                          <p className="mt-1 text-sm font-semibold text-[#0f1f3d]">{term.label}</p>
                          <p className="mt-1 text-sm text-[#0f1f3d]">{term.value}</p>
                          {term.article_ref && <p className="mt-1 text-xs text-[#64748b]">{term.article_ref}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card-base">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">최근 검토 결과</h3>
                    <span className="text-xs text-[#64748b]">{officerBrief.recent_reviews.length}건</span>
                  </div>
                  {!officerBrief.recent_reviews.length ? (
                    <EmptyState message="최근 검토 기록이 없습니다." className="py-8" />
                  ) : (
                    <div className="space-y-2">
                      {officerBrief.recent_reviews.map((review) => {
                        const badge = reviewBadge(review.result)
                        return (
                          <div key={review.id} className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-[#0f1f3d]">{review.scenario}</p>
                              <span className={badge.className}>{badge.label}</span>
                            </div>
                            <p className="mt-1 text-xs text-[#64748b]">우선 기준: {review.prevailing_tier || '-'}</p>
                            <p className="mt-1 text-xs text-[#0f1f3d]">{review.summary || '요약 없음'}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <FundComplianceGrid
                  rows={dashboardFundStatus}
                  isLoading={isDashboardLoading}
                  selectedFundId={legalFundId}
                  onSelectFund={(fundId) => setLegalFundId(fundId)}
                />
                <AmendmentAlerts rows={dashboardAmendments} isLoading={isDashboardLoading} />
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <AuditTimeline rows={dashboardRecentChecks} isLoading={isDashboardLoading} maxItems={15} />
                <div className="card-base space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f1f3d]">전체 문서 인덱싱 및 사용량</h3>
                    <p className="mt-1 text-xs text-[#64748b]">법령·가이드라인 인덱싱 현황과 월간 설명 사용량입니다.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-[#0f1f3d]">
                    <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                      <p className="text-[#64748b]">법률</p>
                      <p className="text-lg font-semibold text-[#0f1f3d]">{dashboardDocumentStats?.laws ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                      <p className="text-[#64748b]">시행령/규칙</p>
                      <p className="text-lg font-semibold text-[#0f1f3d]">{dashboardDocumentStats?.regulations ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                      <p className="text-[#64748b]">가이드라인</p>
                      <p className="text-lg font-semibold text-[#0f1f3d]">{dashboardDocumentStats?.guidelines ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                      <p className="text-[#64748b]">규약/계약</p>
                      <p className="text-lg font-semibold text-[#0f1f3d]">{dashboardDocumentStats?.agreements ?? 0}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3 text-xs text-[#0f1f3d]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#0f1f3d]">월간 설명 사용량</p>
                      <span className={dashboardLlmUsageProgress >= 90 ? 'tag tag-red' : dashboardLlmUsageProgress >= 70 ? 'tag tag-amber' : 'tag tag-blue'}>
                        {dashboardLlmUsageProgress.toFixed(1)}%
                      </span>
                    </div>
                    <p className="mt-2">
                      {(dashboardLlmUsage?.month_total_tokens ?? 0).toLocaleString()} / {(dashboardLlmUsage?.month_limit ?? 0).toLocaleString()} 토큰
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f5f9ff]">
                      <div
                        className={`h-full rounded-full ${
                          dashboardLlmUsageProgress >= 90
                            ? 'bg-[#6d3e44]'
                            : dashboardLlmUsageProgress >= 70
                              ? 'bg-[#b68a00]'
                              : 'bg-[#558ef8]'
                        }`}
                        style={{ width: `${dashboardLlmUsageProgress}%` }}
                      />
                    </div>
                    <p className="mt-2">비용: ${(dashboardLlmUsage?.month_cost_usd ?? 0).toFixed(4)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'obligations' && (
        <>
          <div className="card-base">
            <p className="mb-2 text-xs font-semibold text-[#64748b]">조합 필터</p>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded px-2 py-1 text-xs ${
                  fundFilter === '' ? 'primary-btn' : 'secondary-btn text-[#0f1f3d]'
                }`}
                onClick={() => setFundFilter('')}
              >
                전체
              </button>
              {funds.map((fund) => (
                <button
                  key={fund.id}
                  className={`rounded px-2 py-1 text-xs ${
                    fundFilter === fund.id ? 'primary-btn' : 'secondary-btn text-[#0f1f3d]'
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
                <label className="mb-1 block text-xs font-medium text-[#64748b]">상태</label>
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
                <label className="mb-1 block text-xs font-medium text-[#64748b]">카테고리</label>
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
                <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
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
                            <span className="text-xs text-[#64748b]">완료</span>
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
            <div className="mb-3 rounded-xl border border-[#d8e5fb] bg-[#f8fbff] p-3 text-xs text-[#64748b]">
              이 화면은 `어떤 기준을 자동으로 보는지`를 쉽게 관리하는 곳입니다. 보통은 검토 방식과 중요도만 바꾸면 되고, JSON은 고급 설정에서만 다룹니다.
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748b]">적용 조합</label>
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
                <label className="mb-1 block text-xs font-medium text-[#64748b]">검토 방식</label>
                <select className="form-input" value={ruleLevelFilter} onChange={(event) => setRuleLevelFilter(event.target.value)}>
                  <option value="">전체</option>
                  <option value="L1">기본 존재 확인</option>
                  <option value="L2">수치 기준 확인</option>
                  <option value="L3">기한 확인</option>
                  <option value="L4">서로 맞는지 확인</option>
                  <option value="L5">종합 판단</option>
                </select>
              </div>
              <div className="flex items-end gap-2 md:col-span-2">
                <button className="secondary-btn" onClick={startCreateRule}>
                  검토 기준 추가
                </button>
                <button className="primary-btn" onClick={runManualCheck} disabled={manualCheckMut.isPending || ruleFundFilter === ''}>
                  {manualCheckMut.isPending ? '다시 확인 중...' : '선택 조합 다시 점검'}
                </button>
              </div>
            </div>
          </div>

          <div className="card-base space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#0f1f3d]">{editingRuleId ? `검토 기준 수정 #${editingRuleId}` : '검토 기준 추가'}</p>
              {editingRuleId && (
                <button className="text-xs text-[#64748b] hover:text-[#0f1f3d]" onClick={startCreateRule}>
                  취소
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                className="form-input"
                placeholder="검토 기준 이름 (예: 투자계약서 필수 조항 확인)"
                value={ruleForm.rule_name}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, rule_name: event.target.value }))}
              />
              <select
                className="form-input"
                value={String(editableCondition.type || 'exists')}
                onChange={(event) => {
                  const nextType = event.target.value
                  replaceConditionDraft({ ...(RULE_CONDITION_PRESETS[nextType] || RULE_CONDITION_PRESETS.exists) })
                  setRuleForm((prev) => ({
                    ...prev,
                    level:
                      nextType === 'exists'
                        ? 'L1'
                        : nextType === 'range'
                          ? 'L2'
                          : nextType === 'deadline'
                            ? 'L3'
                            : nextType === 'cross_validate'
                              ? 'L4'
                              : 'L5',
                  }))
                }}
              >
                <option value="exists">존재 확인</option>
                <option value="range">수치 기준 확인</option>
                <option value="deadline">기한 확인</option>
                <option value="cross_validate">서로 맞는지 확인</option>
                <option value="composite">종합 판단</option>
              </select>
              <input
                className="form-input"
                placeholder="업무 분야 (예: 통지, 보고, 투자집행)"
                value={ruleForm.category}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, category: event.target.value }))}
              />
              <select
                className="form-input"
                value={ruleForm.level}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, level: event.target.value }))}
              >
                <option value="L1">기본 존재 확인</option>
                <option value="L2">수치 기준 확인</option>
                <option value="L3">기한 확인</option>
                <option value="L4">서로 맞는지 확인</option>
                <option value="L5">종합 판단</option>
              </select>
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
                <option value="false">문제만 표시</option>
                <option value="true">문제 시 업무 자동 생성</option>
              </select>

              {String(editableCondition.type || 'exists') === 'exists' && (
                <>
                  <input
                    className="form-input"
                    placeholder="확인 대상 (예: document, investment)"
                    value={String(editableCondition.target || '')}
                    onChange={(event) => updateConditionField('target', event.target.value)}
                  />
                  <input
                    className="form-input"
                    placeholder="문서명/문서유형 (예: 투자계약서, 조합규약)"
                    value={String(editableCondition.document_type || editableCondition.document_name || '')}
                    onChange={(event) => {
                      updateConditionField('document_type', event.target.value)
                      updateConditionField('document_name', event.target.value)
                    }}
                  />
                </>
              )}

              {String(editableCondition.type || 'exists') === 'range' && (
                <>
                  <input
                    className="form-input"
                    placeholder="확인 대상 (예: investment_ratio)"
                    value={String(editableCondition.target || '')}
                    onChange={(event) => updateConditionField('target', event.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      placeholder="최소값"
                      value={editableCondition.min == null ? '' : String(editableCondition.min)}
                      onChange={(event) => updateConditionField('min', event.target.value ? Number(event.target.value) : null)}
                    />
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      placeholder="최대값"
                      value={editableCondition.max == null ? '' : String(editableCondition.max)}
                      onChange={(event) => updateConditionField('max', event.target.value ? Number(event.target.value) : null)}
                    />
                  </div>
                </>
              )}

              {String(editableCondition.type || 'exists') === 'deadline' && (
                <>
                  <input
                    className="form-input"
                    placeholder="확인 대상 (예: quarterly_report)"
                    value={String(editableCondition.target || '')}
                    onChange={(event) => updateConditionField('target', event.target.value)}
                  />
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    placeholder="몇 일 전부터 경고할지"
                    value={editableCondition.days_before == null ? '' : String(editableCondition.days_before)}
                    onChange={(event) => updateConditionField('days_before', Number(event.target.value || 0))}
                  />
                </>
              )}

              {String(editableCondition.type || 'exists') === 'cross_validate' && (
                <>
                  <input
                    className="form-input"
                    placeholder="비교 기준 A (예: lp_commitment_sum)"
                    value={String(editableCondition.source || '')}
                    onChange={(event) => updateConditionField('source', event.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="form-input"
                      placeholder="비교 기준 B (예: fund_commitment_total)"
                      value={String(editableCondition.target || '')}
                      onChange={(event) => updateConditionField('target', event.target.value)}
                    />
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      placeholder="허용 오차"
                      value={editableCondition.tolerance == null ? '' : String(editableCondition.tolerance)}
                      onChange={(event) => updateConditionField('tolerance', Number(event.target.value || 0))}
                    />
                  </div>
                </>
              )}

              {String(editableCondition.type || 'exists') === 'composite' && (
                <>
                  <select
                    className="form-input"
                    value={String(editableCondition.logic || 'AND')}
                    onChange={(event) => updateConditionField('logic', event.target.value)}
                  >
                    <option value="AND">모두 충족</option>
                    <option value="OR">하나 이상 충족</option>
                  </select>
                  <input
                    className="form-input"
                    placeholder="묶을 규칙 코드들 (쉼표 구분)"
                    value={Array.isArray(editableCondition.rules) ? editableCondition.rules.join(', ') : ''}
                    onChange={(event) =>
                      updateConditionField(
                        'rules',
                        event.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </>
              )}

              <input
                className="form-input md:col-span-2"
                placeholder="왜 필요한 기준인지 설명"
                value={ruleForm.description ?? ''}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="secondary-btn btn-sm"
                onClick={() => setShowAdvancedRuleEditor((prev) => !prev)}
              >
                {showAdvancedRuleEditor ? '고급 설정 닫기' : '고급 설정 보기'}
              </button>
              <button className="primary-btn" onClick={submitRule} disabled={saveRuleMut.isPending}>
                {saveRuleMut.isPending ? '저장 중...' : editingRuleId ? '검토 기준 수정' : '검토 기준 저장'}
              </button>
            </div>

            {showAdvancedRuleEditor && (
              <div className="grid grid-cols-1 gap-2 rounded-xl border border-[#d8e5fb] bg-[#f8fbff] p-3 md:grid-cols-2">
                <input
                  className="form-input"
                  placeholder="내부 식별코드 (비워두면 자동 생성)"
                  value={ruleForm.rule_code}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, rule_code: event.target.value }))}
                />
                <textarea
                  className="form-input md:col-span-2"
                  rows={8}
                  value={conditionText}
                  onChange={(event) => setConditionText(event.target.value)}
                />
              </div>
            )}
          </div>

          <div className="card-base overflow-auto">
            {isRuleLoading ? (
              <PageLoading />
            ) : rules.length === 0 ? (
              <EmptyState emoji="r" message="규칙이 없습니다." className="py-8" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                  <tr>
                    <th className="px-3 py-2 text-left">검토 기준</th>
                    <th className="px-3 py-2 text-left">확인 방식</th>
                    <th className="px-3 py-2 text-left">무엇을 보는지</th>
                    <th className="px-3 py-2 text-left">적용 범위</th>
                    <th className="px-3 py-2 text-left">중요도</th>
                    <th className="px-3 py-2 text-left">문제 시 처리</th>
                    <th className="px-3 py-2 text-left">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#0f1f3d]">{rule.rule_name}</div>
                        <div className="text-xs text-[#64748b]">{rule.rule_code}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div>{levelPlainLabel(rule.level)}</div>
                        <div className="text-xs text-[#64748b]">{ruleTypePlainLabel(rule.condition)}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-[#0f1f3d]">
                        <div>{rule.plain_summary || rule.description || '-'}</div>
                        <div className="mt-1 text-[#64748b]">기준 자료: {rule.check_basis || '-'}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-[#0f1f3d]">{rule.applies_to || '-'}</td>
                      <td className="px-3 py-2">{rule.severity}</td>
                      <td className="px-3 py-2 text-xs text-[#0f1f3d]">{rule.recommended_action || (rule.auto_task ? '자동 업무 생성' : '표시만')}</td>
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
                <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
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
                <label className="mb-1 block text-xs font-medium text-[#64748b]">결과</label>
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
                  {manualCheckMut.isPending ? '다시 확인 중...' : '선택 조합 다시 확인'}
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
                <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
                  <tr>
                    <th className="px-3 py-2 text-left">확인 시각</th>
                    <th className="px-3 py-2 text-left">조합</th>
                    <th className="px-3 py-2 text-left">검토 기준</th>
                    <th className="px-3 py-2 text-left">확인 방식</th>
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
                          <div className="font-mono text-xs text-[#64748b]">{check.rule_code || '-'}</div>
                          <div>{check.rule_name || '-'}</div>
                        </td>
                        <td className="px-3 py-2">{levelPlainLabel(check.level)}</td>
                        <td className="px-3 py-2">
                          <span className={badge.className}>{badge.label}</span>
                        </td>
                        <td className="px-3 py-2 max-w-[380px] truncate" title={check.detail || ''}>
                          {check.detail || '-'}
                        </td>
                        <td className="px-3 py-2">
                          <div>{check.trigger_type || '-'}</div>
                          <div className="text-xs text-[#64748b]">{check.trigger_source || '-'}</div>
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
              <h3 className="text-sm font-semibold text-[#0f1f3d]">정기 준수 점검 스케줄</h3>
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
                  <div key={job.job_id} className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#0f1f3d]">{job.label}</p>
                      <span className={`tag ${job.enabled ? 'tag-green' : 'tag-gray'}`}>{job.enabled ? '활성' : '비활성'}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#64748b]">{job.cron}</p>
                    <p className="mt-2 text-xs text-[#64748b]">다음 실행: {job.next_run_at ? new Date(job.next_run_at).toLocaleString() : '-'}</p>
                    <p className="text-xs text-[#64748b]">최근 실행: {job.last_run_at ? new Date(job.last_run_at).toLocaleString() : '-'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-base space-y-3">
            <h3 className="text-sm font-semibold text-[#0f1f3d]">수동 스캔</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select
                className="form-input"
                value={manualScanMode}
                onChange={(event) => setManualScanMode(event.target.value as 'daily' | 'full' | 'law')}
              >
                <option value="daily">일간 빠른 확인</option>
                <option value="full">월간 전체 확인</option>
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
              <div className="rounded-xl border border-[#d8e5fb] bg-white/70 p-3 text-xs text-[#0f1f3d]">
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
              <h3 className="text-sm font-semibold text-[#0f1f3d]">최근 스캔 이력</h3>
              <span className="text-xs text-[#64748b]">{scanHistory?.period ?? scanPeriod}</span>
            </div>
            {isScanHistoryLoading ? (
              <PageLoading />
            ) : !scanHistory?.history?.length ? (
              <EmptyState emoji="h" message="스캔 이력이 없습니다." className="py-6" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
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
            <h3 className="mb-2 text-sm font-semibold text-[#0f1f3d]">법령 개정 알림</h3>
            {isAmendmentsLoading ? (
              <PageLoading />
            ) : amendmentAlerts.length === 0 ? (
              <EmptyState emoji="a" message="아직 법령 개정 알림이 없습니다." className="py-6" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-[#f5f9ff] text-xs text-[#64748b]">
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
                <label className="mb-1 block text-xs font-medium text-[#64748b]">조합</label>
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
                <label className="mb-1 block text-xs font-medium text-[#64748b]">패턴 분석 기간</label>
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
                <label className="mb-1 block text-xs font-medium text-[#64748b]">리포트 월</label>
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
            <h3 className="mb-2 text-base font-semibold text-[#0f1f3d]">의무사항 완료 처리</h3>
            <p className="mb-3 text-xs text-[#64748b]">
              {targetRow.rule_title || targetRow.rule_code || '-'} | 마감 {targetRow.due_date || '-'}
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748b]">완료자</label>
                <input className="form-input" value={completedBy} onChange={(event) => setCompletedBy(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748b]">근거 메모</label>
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




