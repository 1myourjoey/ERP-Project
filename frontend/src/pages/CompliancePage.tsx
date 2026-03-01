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
  if (row.status === 'completed') return { label: 'Completed', className: 'tag tag-green' }
  if (row.status === 'waived') return { label: 'Waived', className: 'tag tag-gray' }
  if (row.status === 'overdue' || (row.d_day != null && row.d_day < 0)) {
    return { label: 'Overdue', className: 'tag tag-red' }
  }
  if (row.d_day != null && row.d_day <= 7) return { label: 'Due Soon', className: 'tag tag-amber' }
  return { label: 'Pending', className: 'tag tag-blue' }
}

function checkBadge(result: string): { label: string; className: string } {
  if (result === 'pass') return { label: 'PASS', className: 'tag tag-green' }
  if (result === 'warning') return { label: 'WARNING', className: 'tag tag-amber' }
  if (result === 'fail') return { label: 'FAIL', className: 'tag tag-red' }
  if (result === 'error') return { label: 'ERROR', className: 'tag tag-red' }
  return { label: result.toUpperCase(), className: 'tag tag-gray' }
}

function dDayLabel(dDay: number | null | undefined): string {
  if (dDay == null) return '-'
  if (dDay < 0) return `D+${Math.abs(dDay)}`
  if (dDay === 0) return 'D-Day'
  return `D-${dDay}`
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
      addToast('success', 'Obligation marked as completed.')
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
      addToast('success', editingRuleId ? 'Rule updated.' : 'Rule created.')
      setEditingRuleId(null)
      setRuleForm(emptyRuleForm)
      setConditionText(stringifyCondition(emptyRuleForm.condition))
    },
  })

  const deleteRuleMut = useMutation({
    mutationFn: (ruleId: number) => deleteComplianceRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complianceRules'] })
      addToast('success', 'Rule deleted.')
    },
  })

  const manualCheckMut = useMutation({
    mutationFn: (selectedFundId: number) => runComplianceCheck(selectedFundId, 'manual'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['complianceDashboard'] })
      queryClient.invalidateQueries({ queryKey: ['complianceChecks'] })
      addToast('success', `Manual check finished. Checked ${result.checked_count}, failed ${result.failed_count}.`)
    },
  })

  const interpretMut = useMutation({
    mutationFn: (payload: { query: string; fund_id?: number | null }) => interpretComplianceQuery(payload),
    onSuccess: (result) => {
      setInterpretResult(result)
      queryClient.invalidateQueries({ queryKey: ['complianceLlmUsage'] })
      addToast('success', result.tier === 'L1' ? 'Answered by rule engine (L1).' : 'Answered by RAG + LLM (L2).')
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
        addToast('success', `Manual scan completed: ${result.scan_type}`)
      } else {
        addToast('success', 'Manual law amendment check completed.')
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
      addToast('warning', 'Condition JSON is invalid.')
      return
    }
    if (!ruleForm.rule_code.trim() || !ruleForm.rule_name.trim() || !ruleForm.category.trim()) {
      addToast('warning', 'Please fill rule_code, rule_name, and category.')
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
      addToast('warning', 'Select a fund before running manual check.')
      return
    }
    manualCheckMut.mutate(ruleFundFilter)
  }

  function submitLegalQuery() {
    const normalized = legalQuery.trim()
    if (!normalized) {
      addToast('warning', 'Please enter a legal query.')
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
      activeTab === tab ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'
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
          <h2 className="page-title">Compliance</h2>
          <p className="page-subtitle">Manage obligations, rules, checks, and legal guidance in one place.</p>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Legal Query</h3>
            <p className="mt-1 text-xs text-gray-500">L1 rule engine first, then L2 RAG + GPT analysis when needed.</p>
          </div>
          <span className={`tag ${interpretResult?.tier === 'L1' ? 'tag-green' : 'tag-indigo'}`}>
            {interpretResult?.tier ? `Last answer: ${interpretResult.tier}` : 'No answer yet'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <input
            className="form-input md:col-span-4"
            placeholder="Example: Is a same-issuer over-concentration currently in breach?"
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
            <option value="">No fund filter</option>
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
          <button className="primary-btn" onClick={submitLegalQuery} disabled={interpretMut.isPending}>
            {interpretMut.isPending ? 'Querying...' : 'Ask'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3 lg:col-span-2">
            <p className="mb-1 text-xs font-semibold text-gray-600">Answer</p>
            {interpretResult ? (
              <>
                <pre className="whitespace-pre-wrap text-sm text-gray-800">{interpretResult.answer}</pre>
                {interpretResult.sources.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-semibold text-gray-600">Sources</p>
                    {interpretResult.sources.map((source, idx) => {
                      const similarity =
                        source.distance == null || Number.isNaN(source.distance)
                          ? '-'
                          : Math.max(0, Math.min(1, 1 - source.distance)).toFixed(2)
                      return (
                        <div
                          key={`${source.collection}-${idx}`}
                          className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
                        >
                          <div className="font-medium">
                            [{source.collection}] {source.article || 'N/A'} | score {similarity}
                          </div>
                          <div className="mt-0.5 text-gray-600">{source.text}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Submit a question to generate a legal interpretation.</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-600">Token Usage</p>
              <select
                className="form-input-sm w-auto"
                value={usagePeriod}
                onChange={(event) => setUsagePeriod(event.target.value as 'month' | 'week' | 'all')}
              >
                <option value="month">This month</option>
                <option value="week">Last 7 days</option>
                <option value="all">All</option>
              </select>
            </div>
            {isUsageLoading ? (
              <p className="text-xs text-gray-500">Loading...</p>
            ) : (
              <div className="space-y-2 text-xs text-gray-700">
                <p>
                  Used: <span className="font-semibold">{(llmUsage?.used_tokens ?? 0).toLocaleString()}</span> tokens
                </p>
                {llmUsage?.limit_tokens != null && (
                  <>
                    <p>
                      Limit: <span className="font-semibold">{llmUsage.limit_tokens.toLocaleString()}</span> | Remaining:{' '}
                      <span className="font-semibold">{(llmUsage.remaining_tokens ?? 0).toLocaleString()}</span>
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${
                          usageProgress >= 90 ? 'bg-red-500' : usageProgress >= 70 ? 'bg-amber-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${usageProgress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">Usage {usageProgress.toFixed(1)}%</p>
                  </>
                )}
                <p>Estimated cost: ${(llmUsage?.used_cost_usd ?? 0).toFixed(4)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-base">
        <div className="flex flex-wrap gap-2">
          <button className={tabClass('dashboard')} onClick={() => setActiveTab('dashboard')}>
            Dashboard
          </button>
          <button className={tabClass('obligations')} onClick={() => setActiveTab('obligations')}>
            Obligations
          </button>
          <button className={tabClass('rules')} onClick={() => setActiveTab('rules')}>
            Rules
          </button>
          <button className={tabClass('checks')} onClick={() => setActiveTab('checks')}>
            Checks
          </button>
          <button className={tabClass('documents')} onClick={() => setActiveTab('documents')}>
            Library
          </button>
          <button className={tabClass('schedule')} onClick={() => setActiveTab('schedule')}>
            Schedule & Amendments
          </button>
          <button className={tabClass('history')} onClick={() => setActiveTab('history')}>
            History & Report
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="card-base">
              <p className="text-xs text-gray-500">Total Rules</p>
              <p className="mt-1 text-xl font-semibold text-gray-800">{summaryRules}</p>
            </div>
            <div className="card-base">
              <p className="text-xs text-gray-500">Active Violations</p>
              <p className="mt-1 text-xl font-semibold text-red-600">{summaryViolations}</p>
            </div>
            <div className="card-base">
              <p className="text-xs text-gray-500">Warnings</p>
              <p className="mt-1 text-xl font-semibold text-amber-600">{summaryWarnings}</p>
            </div>
            <div className="card-base">
              <p className="text-xs text-gray-500">Passed</p>
              <p className="mt-1 text-xl font-semibold text-green-700">{summaryPassed}</p>
            </div>
            <div className="card-base">
              <p className="text-xs text-gray-500">Compliance Rate</p>
              <p className="mt-1 text-xl font-semibold text-gray-800">{summaryRate.toFixed(1)}%</p>
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
                <h3 className="text-sm font-semibold text-gray-800">Indexing & LLM Usage</h3>
                <p className="mt-1 text-xs text-gray-500">Vector document chunks and monthly legal LLM usage.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
                  <p className="text-gray-500">Laws</p>
                  <p className="text-lg font-semibold text-gray-800">{dashboardDocumentStats?.laws ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
                  <p className="text-gray-500">Regulations</p>
                  <p className="text-lg font-semibold text-gray-800">{dashboardDocumentStats?.regulations ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
                  <p className="text-gray-500">Guidelines</p>
                  <p className="text-lg font-semibold text-gray-800">{dashboardDocumentStats?.guidelines ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
                  <p className="text-gray-500">Agreements</p>
                  <p className="text-lg font-semibold text-gray-800">{dashboardDocumentStats?.agreements ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
                  <p className="text-gray-500">Internal</p>
                  <p className="text-lg font-semibold text-gray-800">{dashboardDocumentStats?.internal ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white/70 p-3">
                  <p className="text-gray-500">Total Chunks</p>
                  <p className="text-lg font-semibold text-gray-800">{dashboardDocumentStats?.total_chunks ?? 0}</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white/70 p-3 text-xs text-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-gray-700">Monthly Token Usage</p>
                  <span className={dashboardLlmUsageProgress >= 90 ? 'tag tag-red' : dashboardLlmUsageProgress >= 70 ? 'tag tag-amber' : 'tag tag-blue'}>
                    {dashboardLlmUsageProgress.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-2">
                  {(dashboardLlmUsage?.month_total_tokens ?? 0).toLocaleString()} / {(dashboardLlmUsage?.month_limit ?? 0).toLocaleString()} tokens
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
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
                <p className="mt-2">Cost: ${(dashboardLlmUsage?.month_cost_usd ?? 0).toFixed(4)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'obligations' && (
        <>
          <div className="card-base">
            <p className="mb-2 text-xs font-semibold text-gray-600">Fund Filter</p>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded px-2 py-1 text-xs ${
                  fundFilter === '' ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'
                }`}
                onClick={() => setFundFilter('')}
              >
                All
              </button>
              {funds.map((fund) => (
                <button
                  key={fund.id}
                  className={`rounded px-2 py-1 text-xs ${
                    fundFilter === fund.id ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'
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
                <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
                <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All</option>
                  <option value="pending">pending</option>
                  <option value="in_progress">in_progress</option>
                  <option value="overdue">overdue</option>
                  <option value="completed">completed</option>
                  <option value="waived">waived</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
                <select className="form-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="">All</option>
                  <option value="reporting">reporting</option>
                  <option value="investment_limit">investment_limit</option>
                  <option value="impairment">impairment</option>
                  <option value="asset_rating">asset_rating</option>
                </select>
              </div>
            </div>
          </div>

          {adhocNotice && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Ad-hoc report notice: {adhocNotice.rule_title} | due {adhocNotice.due_date} ({dDayLabel(adhocNotice.d_day)})
            </div>
          )}

          <div className="card-base overflow-auto">
            {isObligationLoading ? (
              <PageLoading />
            ) : obligations.length === 0 ? (
              <EmptyState emoji="i" message="No compliance obligations found." className="py-8" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Due Date</th>
                    <th className="px-3 py-2 text-left">D-Day</th>
                    <th className="px-3 py-2 text-left">Obligation</th>
                    <th className="px-3 py-2 text-left">Guideline Ref</th>
                    <th className="px-3 py-2 text-left">Target System</th>
                    <th className="px-3 py-2 text-left">Fund</th>
                    <th className="px-3 py-2 text-left">Action</th>
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
                            <span className="text-xs text-gray-400">Done</span>
                          ) : (
                            <button className="secondary-btn btn-sm" onClick={() => setTargetRow(row)}>
                              Complete
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
                <label className="mb-1 block text-xs font-medium text-gray-600">Fund</label>
                <select
                  className="form-input"
                  value={ruleFundFilter}
                  onChange={(event) => setRuleFundFilter(event.target.value ? Number(event.target.value) : '')}
                >
                  <option value="">All (global + fund)</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Level</label>
                <select className="form-input" value={ruleLevelFilter} onChange={(event) => setRuleLevelFilter(event.target.value)}>
                  <option value="">All</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                  <option value="L4">L4</option>
                  <option value="L5">L5</option>
                </select>
              </div>
              <div className="flex items-end gap-2 md:col-span-2">
                <button className="secondary-btn" onClick={startCreateRule}>
                  New Rule
                </button>
                <button className="primary-btn" onClick={runManualCheck} disabled={manualCheckMut.isPending || ruleFundFilter === ''}>
                  {manualCheckMut.isPending ? 'Running...' : 'Run Manual Check'}
                </button>
              </div>
            </div>
          </div>

          <div className="card-base space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">{editingRuleId ? `Edit Rule #${editingRuleId}` : 'Create Rule'}</p>
              {editingRuleId && (
                <button className="text-xs text-gray-500 hover:text-gray-700" onClick={startCreateRule}>
                  Cancel
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                className="form-input"
                placeholder="rule_code (e.g. INV-LIMIT-001)"
                value={ruleForm.rule_code}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, rule_code: event.target.value }))}
              />
              <input
                className="form-input"
                placeholder="rule_name"
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
                placeholder="category"
                value={ruleForm.category}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, category: event.target.value }))}
              />
              <select
                className="form-input"
                value={ruleForm.severity}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, severity: event.target.value }))}
              >
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="error">error</option>
                <option value="critical">critical</option>
              </select>
              <select
                className="form-input"
                value={ruleForm.auto_task ? 'true' : 'false'}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, auto_task: event.target.value === 'true' }))}
              >
                <option value="false">auto_task: false</option>
                <option value="true">auto_task: true</option>
              </select>
              <textarea className="form-input md:col-span-2" rows={8} value={conditionText} onChange={(event) => setConditionText(event.target.value)} />
              <input
                className="form-input md:col-span-2"
                placeholder="description"
                value={ruleForm.description ?? ''}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>

            <div>
              <button className="primary-btn" onClick={submitRule} disabled={saveRuleMut.isPending}>
                {saveRuleMut.isPending ? 'Saving...' : editingRuleId ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>

          <div className="card-base overflow-auto">
            {isRuleLoading ? (
              <PageLoading />
            ) : rules.length === 0 ? (
              <EmptyState emoji="r" message="No rules found." className="py-8" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Level</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">Severity</th>
                    <th className="px-3 py-2 text-left">Auto Task</th>
                    <th className="px-3 py-2 text-left">Active</th>
                    <th className="px-3 py-2 text-left">Action</th>
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
                      <td className="px-3 py-2">{rule.auto_task ? 'Y' : 'N'}</td>
                      <td className="px-3 py-2">{rule.is_active ? 'Y' : 'N'}</td>
                      <td className="px-3 py-2 space-x-2">
                        <button className="secondary-btn btn-sm" onClick={() => startEditRule(rule)}>
                          Edit
                        </button>
                        <button
                          className="secondary-btn btn-sm"
                          disabled={deleteRuleMut.isPending}
                          onClick={() => deleteRuleMut.mutate(rule.id)}
                        >
                          Delete
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
                <label className="mb-1 block text-xs font-medium text-gray-600">Fund</label>
                <select
                  className="form-input"
                  value={ruleFundFilter}
                  onChange={(event) => setRuleFundFilter(event.target.value ? Number(event.target.value) : '')}
                >
                  <option value="">All</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Result</label>
                <select className="form-input" value={checkResultFilter} onChange={(event) => setCheckResultFilter(event.target.value)}>
                  <option value="">All</option>
                  <option value="pass">pass</option>
                  <option value="warning">warning</option>
                  <option value="fail">fail</option>
                  <option value="error">error</option>
                </select>
              </div>
              <div className="flex items-end md:col-span-2">
                <button className="primary-btn" onClick={runManualCheck} disabled={manualCheckMut.isPending || ruleFundFilter === ''}>
                  {manualCheckMut.isPending ? 'Running...' : 'Run Manual Check'}
                </button>
              </div>
            </div>
          </div>

          <div className="card-base overflow-auto">
            {isCheckLoading ? (
              <PageLoading />
            ) : checks.length === 0 ? (
              <EmptyState emoji="c" message="No check records found." className="py-8" />
            ) : (
              <table className="min-w-[1180px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Checked At</th>
                    <th className="px-3 py-2 text-left">Fund</th>
                    <th className="px-3 py-2 text-left">Rule</th>
                    <th className="px-3 py-2 text-left">Level</th>
                    <th className="px-3 py-2 text-left">Result</th>
                    <th className="px-3 py-2 text-left">Detail</th>
                    <th className="px-3 py-2 text-left">Trigger</th>
                    <th className="px-3 py-2 text-left">Remediation Task</th>
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
                          <div className="font-mono text-xs text-gray-500">{check.rule_code || '-'}</div>
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
                          <div className="text-xs text-gray-500">{check.trigger_source || '-'}</div>
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
              <h3 className="text-sm font-semibold text-gray-800">Scheduled Compliance Jobs</h3>
              <select
                className="form-input-sm w-auto"
                value={scanPeriod}
                onChange={(event) => setScanPeriod(event.target.value as 'week' | 'month' | 'all')}
              >
                <option value="week">Last 7 days</option>
                <option value="month">Last 30 days</option>
                <option value="all">All</option>
              </select>
            </div>
            {isScanHistoryLoading ? (
              <PageLoading />
            ) : !scanHistory?.schedules?.length ? (
              <EmptyState emoji="s" message="No scheduler configuration found." className="py-6" />
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                {scanHistory.schedules.map((job) => (
                  <div key={job.job_id} className="rounded-xl border border-gray-200 bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">{job.label}</p>
                      <span className={`tag ${job.enabled ? 'tag-green' : 'tag-gray'}`}>{job.enabled ? 'ON' : 'OFF'}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{job.cron}</p>
                    <p className="mt-2 text-xs text-gray-600">Next: {job.next_run_at ? new Date(job.next_run_at).toLocaleString() : '-'}</p>
                    <p className="text-xs text-gray-600">Last: {job.last_run_at ? new Date(job.last_run_at).toLocaleString() : '-'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-base space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Manual Scan</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select
                className="form-input"
                value={manualScanMode}
                onChange={(event) => setManualScanMode(event.target.value as 'daily' | 'full' | 'law')}
              >
                <option value="daily">Daily Scope (L1-L3)</option>
                <option value="full">Monthly Full Audit (L1-L5)</option>
                <option value="law">Law Amendment Check</option>
              </select>
              <select
                className="form-input"
                value={manualScanFundId}
                onChange={(event) => setManualScanFundId(event.target.value ? Number(event.target.value) : '')}
                disabled={manualScanMode !== 'daily'}
              >
                <option value="">All Funds</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
              <button className="primary-btn md:col-span-2" onClick={runManualScheduledScan} disabled={manualScheduledScanMut.isPending}>
                {manualScheduledScanMut.isPending ? 'Running...' : 'Run Manual Scan'}
              </button>
            </div>
            {manualScanResult && (
              <div className="rounded-xl border border-gray-200 bg-white/70 p-3 text-xs text-gray-700">
                {manualScanResult.scan_type ? (
                  <div className="space-y-1">
                    <p>
                      Type: <span className="font-semibold">{manualScanResult.scan_type}</span>
                    </p>
                    <p>
                      Rules: <span className="font-semibold">{manualScanResult.total_rules ?? 0}</span> | Pass{' '}
                      <span className="font-semibold text-green-700">{manualScanResult.passed ?? 0}</span> | Warn{' '}
                      <span className="font-semibold text-amber-700">{manualScanResult.warnings ?? 0}</span> | Fail{' '}
                      <span className="font-semibold text-red-700">{manualScanResult.failed ?? 0}</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p>
                      Amendments detected: <span className="font-semibold">{manualScanResult.count ?? 0}</span>
                    </p>
                    <p>
                      Newly saved alerts: <span className="font-semibold">{manualScanResult.saved_count ?? 0}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card-base overflow-auto">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-800">Recent Scan History</h3>
              <span className="text-xs text-gray-500">{scanHistory?.period ?? scanPeriod}</span>
            </div>
            {isScanHistoryLoading ? (
              <PageLoading />
            ) : !scanHistory?.history?.length ? (
              <EmptyState emoji="h" message="No scan history found." className="py-6" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Scan</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Funds</th>
                    <th className="px-3 py-2 text-left">Checked</th>
                    <th className="px-3 py-2 text-left">Pass</th>
                    <th className="px-3 py-2 text-left">Warn</th>
                    <th className="px-3 py-2 text-left">Fail</th>
                    <th className="px-3 py-2 text-left">Last Run</th>
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
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Law Amendment Alerts</h3>
            {isAmendmentsLoading ? (
              <PageLoading />
            ) : amendmentAlerts.length === 0 ? (
              <EmptyState emoji="a" message="No amendment alerts yet." className="py-6" />
            ) : (
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Effective Date</th>
                    <th className="px-3 py-2 text-left">Version</th>
                    <th className="px-3 py-2 text-left">Summary</th>
                    <th className="px-3 py-2 text-left">Created</th>
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
                <label className="mb-1 block text-xs font-medium text-gray-600">Fund</label>
                <select
                  className="form-input"
                  value={historyFundId}
                  onChange={(event) => setHistoryFundId(event.target.value ? Number(event.target.value) : '')}
                >
                  <option value="">All Funds (for suggestions/remediation)</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Pattern Window</label>
                <select
                  className="form-input"
                  value={patternMonths}
                  onChange={(event) => setPatternMonths(Number(event.target.value))}
                >
                  <option value={3}>Last 3 months</option>
                  <option value={6}>Last 6 months</option>
                  <option value={12}>Last 12 months</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Report Month</label>
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

      {activeTab === 'documents' && <DocumentLibrary />}

      {targetRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-gray-900">Complete Obligation</h3>
            <p className="mb-3 text-xs text-gray-500">
              {targetRow.rule_title || targetRow.rule_code || '-'} | due {targetRow.due_date || '-'}
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Completed By</label>
                <input className="form-input" value={completedBy} onChange={(event) => setCompletedBy(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Evidence Note</label>
                <textarea className="form-input" rows={3} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="secondary-btn" onClick={() => setTargetRow(null)}>
                Cancel
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
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
