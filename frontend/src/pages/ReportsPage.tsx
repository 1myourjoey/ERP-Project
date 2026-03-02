import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  createRegularReport,
  deleteRegularReport,
  fetchReportPreChecks,
  fetchFunds,
  fetchRegularReports,
  runReportPreCheck,
  updateRegularReport,
  type Fund,
  type PreReportCheckFinding,
  type PreReportCheckResult,
  type RegularReport,
  type RegularReportInput,
} from '../lib/api'
import { labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import PageLoading from '../components/PageLoading'

interface FilterState {
  report_target: string
  fund_id: number | null
  status: string
}

const REPORT_TARGET_OPTIONS = ['중기부', 'VICS', 'LP', '내부보고', '연차보고', '기타']
const STATUS_OPTIONS = ['예정', '준비중', '제출완료', '확인완료']

const EMPTY_FILTERS: FilterState = {
  report_target: '',
  fund_id: null,
  status: '',
}

const EMPTY_INPUT: RegularReportInput = {
  report_target: '중기부',
  fund_id: null,
  period: '',
  due_date: '',
  status: '예정',
  submitted_date: null,
  task_id: null,
  memo: '',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ko-KR')
}

function dueBadge(report: RegularReport): { text: string; className: string } | null {
  if (report.status === '제출완료' || report.status === '확인완료' || report.status === '전송완료') {
    return { text: '제출 완료', className: 'tag tag-green' }
  }
  if (report.days_remaining == null) return null
  if (report.days_remaining < 0) return { text: `지연 D+${Math.abs(report.days_remaining)}`, className: 'tag tag-red' }
  if (report.days_remaining <= 3) return { text: `D-${report.days_remaining}`, className: 'tag tag-red' }
  if (report.days_remaining <= 7) return { text: `D-${report.days_remaining}`, className: 'tag tag-amber' }
  return { text: `D-${report.days_remaining}`, className: 'tag tag-gray' }
}

function statusBadgeClass(status: string): string {
  if (status === '완료' || status === '확인완료' || status === '제출완료' || status === '전송완료') {
    return 'rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
  }
  if (status === '준비중' || status === '수집중' || status === '검수중') {
    return 'rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'
  }
  if (status === '요청' || status === '작성중' || status === '예정') {
    return 'rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700'
  }
  return 'rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700'
}

function severityBadgeClass(severity: string): string {
  if (severity === 'error') return 'tag tag-red'
  if (severity === 'warning') return 'tag tag-amber'
  if (severity === 'info') return 'tag tag-blue'
  return 'tag tag-gray'
}

function preCheckStatusBadgeClass(status: string): string {
  if (status === 'error') return 'tag tag-red'
  if (status === 'warning') return 'tag tag-amber'
  return 'tag tag-green'
}

function findingReferenceText(finding: PreReportCheckFinding): string | null {
  if (finding.reference && finding.reference.trim()) return finding.reference
  if (finding.rule_code && finding.rule_code.trim()) return finding.rule_code
  return null
}

export default function ReportsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const location = useLocation()
  const highlightId = ((location.state as { highlightId?: number } | null)?.highlightId) ?? null

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [showCreate, setShowCreate] = useState(false)
  const [newReport, setNewReport] = useState<RegularReportInput>(EMPTY_INPUT)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<RegularReportInput | null>(null)
  const [openPreCheckId, setOpenPreCheckId] = useState<number | null>(null)

  const params = useMemo(
    () => ({
      report_target: filters.report_target || undefined,
      fund_id: filters.fund_id || undefined,
      status: filters.status || undefined,
    }),
    [filters],
  )

  const { data: funds } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: rows, isLoading } = useQuery<RegularReport[]>({
    queryKey: ['regularReports', params],
    queryFn: () => fetchRegularReports(params),
  })
  const { data: preChecks = [], isLoading: isPreChecksLoading } = useQuery<PreReportCheckResult[]>({
    queryKey: ['reportPreChecks', openPreCheckId],
    queryFn: () => fetchReportPreChecks(openPreCheckId as number),
    enabled: openPreCheckId != null,
  })

  const createMut = useMutation({
    mutationFn: (data: RegularReportInput) => createRegularReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularReports'] })
      setShowCreate(false)
      setNewReport(EMPTY_INPUT)
      addToast('success', '보고 기록을 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<RegularReportInput> }) => updateRegularReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularReports'] })
      setEditingId(null)
      setEditForm(null)
      addToast('success', '보고 기록을 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRegularReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularReports'] })
      addToast('success', '보고 기록을 삭제했습니다.')
    },
  })

  const runPreCheckMut = useMutation({
    mutationFn: (reportId: number) => runReportPreCheck(reportId),
    onMutate: (reportId) => {
      setOpenPreCheckId(reportId)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['reportPreChecks', result.report_id] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      addToast(
        result.total_errors > 0 ? 'warning' : 'success',
        `사전 검증 완료: 오류 ${result.total_errors}건, 경고 ${result.total_warnings}건`,
      )
    },
  })

  const matrixRows = useMemo(() => {
    const targets = REPORT_TARGET_OPTIONS
    return (funds || []).map((fund) => {
      const byTarget: Record<string, RegularReport | null> = Object.fromEntries(
        targets.map((target) => [target, null]),
      )
      for (const row of rows || []) {
        if (row.fund_id !== fund.id) continue
        const existing = byTarget[row.report_target]
        if (!existing) {
          byTarget[row.report_target] = row
          continue
        }
        const existingDate = existing.due_date || existing.created_at || ''
        const nextDate = row.due_date || row.created_at || ''
        if (nextDate > existingDate) byTarget[row.report_target] = row
      }
      return { fund, byTarget }
    })
  }, [funds, rows])

  const latestPreCheck = openPreCheckId ? (preChecks[0] ?? null) : null

  function renderFindingGroup(title: string, findings: PreReportCheckFinding[]) {
    return (
      <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-700">이상 없음</p>
        ) : (
          <div className="space-y-1.5">
            {findings.map((finding, idx) => {
              const refText = findingReferenceText(finding)
              return (
                <div key={`${title}-${idx}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={severityBadgeClass(finding.severity)}>
                      {finding.severity.toUpperCase()}
                    </span>
                    <span className="text-xs font-medium text-slate-800">{finding.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-700">{finding.detail}</p>
                  {refText && <p className="mt-0.5 text-[11px] text-slate-500">근거: {refText}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
      <h2 className="page-title">보고·공시 관리</h2>
          <p className="page-subtitle">정기/수시 보고 일정과 제출 상태를 관리합니다.</p>
        </div>
      </div>

      <div className="card-base">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">보고 대상</label>
            <select value={filters.report_target} onChange={(e) => setFilters((prev) => ({ ...prev, report_target: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-2 py-1 text-sm">
              <option value="">전체 대상</option>
              {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{target}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">조합</label>
            <select value={filters.fund_id || ''} onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="w-full rounded-xl border border-slate-200 px-2 py-1 text-sm">
              <option value="">전체 조합</option>
              {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">상태</label>
            <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-2 py-1 text-sm">
              <option value="">전체 상태</option>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="secondary-btn">필터 초기화</button>
          <button onClick={() => setShowCreate((prev) => !prev)} className="primary-btn">+ 보고 기록 추가</button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">신규 보고 기록</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">보고 대상</label>
              <select value={newReport.report_target} onChange={(e) => setNewReport((prev) => ({ ...prev, report_target: e.target.value }))} className="form-input">
                {REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{target}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">조합</label>
              <select value={newReport.fund_id || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))} className="form-input">
                <option value="">조합 미지정</option>
                {funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">기간</label>
              <input value={newReport.period} onChange={(e) => setNewReport((prev) => ({ ...prev, period: e.target.value }))} className="form-input" placeholder="예: 2026-Q1" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">마감일</label>
              <input type="date" value={newReport.due_date || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, due_date: e.target.value || null }))} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">상태</label>
              <select value={newReport.status || '예정'} onChange={(e) => setNewReport((prev) => ({ ...prev, status: e.target.value }))} className="form-input">
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">메모</label>
            <textarea value={newReport.memo || ''} onChange={(e) => setNewReport((prev) => ({ ...prev, memo: e.target.value }))} rows={3} className="form-input" placeholder="선택 입력" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!newReport.report_target || !newReport.period.trim()) return
                createMut.mutate({
                  ...newReport,
                  period: newReport.period.trim(),
                  memo: newReport.memo?.trim() || null,
                })
              }}
              disabled={createMut.isPending}
              className="primary-btn"
            >
              저장
            </button>
            <button onClick={() => setShowCreate(false)} className="secondary-btn">취소</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {!!matrixRows.length && (
          <div className="card-base overflow-auto">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">조합별 보고 현황 매트릭스</h3>
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-2 py-2 text-left">조합</th>
                  {REPORT_TARGET_OPTIONS.map((target) => (
                    <th key={target} className="px-2 py-2 text-left">{target}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRows.map(({ fund, byTarget }) => (
                  <tr key={fund.id} className="border-t">
                    <td className="px-2 py-2 font-medium text-slate-800">{fund.name}</td>
                    {REPORT_TARGET_OPTIONS.map((target) => {
                      const cell = byTarget[target]
                      return (
                        <td key={`${fund.id}-${target}`} className="px-2 py-2">
                          {cell ? (
                            <span className={statusBadgeClass(cell.status)}>{labelStatus(cell.status)}</span>
                          ) : (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">미등록</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isLoading ? (
          <PageLoading />
        ) : !rows?.length ? (
          <EmptyState emoji="📑" message="보고 기록이 없어요" action={() => setShowCreate(true)} actionLabel="보고 등록" />
        ) : (
          rows.map((row) => {
            const badge = dueBadge(row)
            const isEditing = editingId === row.id && !!editForm
            return (
              <div key={row.id} className={`card-base ${highlightId === row.id ? 'ring-2 ring-blue-300' : ''}`}>
                {isEditing && editForm ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                      <div><label className="mb-1 block text-xs font-medium text-slate-600">보고 대상</label><select value={editForm.report_target} onChange={(e) => setEditForm((prev) => prev ? { ...prev, report_target: e.target.value } : prev)} className="form-input">{REPORT_TARGET_OPTIONS.map((target) => <option key={target} value={target}>{target}</option>)}</select></div>
                      <div><label className="mb-1 block text-xs font-medium text-slate-600">조합</label><select value={editForm.fund_id || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, fund_id: Number(e.target.value) || null } : prev)} className="form-input"><option value="">조합 미지정</option>{funds?.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></div>
                      <div><label className="mb-1 block text-xs font-medium text-slate-600">기간</label><input value={editForm.period} onChange={(e) => setEditForm((prev) => prev ? { ...prev, period: e.target.value } : prev)} className="form-input" /></div>
                      <div><label className="mb-1 block text-xs font-medium text-slate-600">마감일</label><input type="date" value={editForm.due_date || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, due_date: e.target.value || null } : prev)} className="form-input" /></div>
                      <div><label className="mb-1 block text-xs font-medium text-slate-600">상태</label><select value={editForm.status || '예정'} onChange={(e) => setEditForm((prev) => prev ? { ...prev, status: e.target.value } : prev)} className="form-input">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div><label className="mb-1 block text-xs font-medium text-slate-600">제출일</label><input type="date" value={editForm.submitted_date || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, submitted_date: e.target.value || null } : prev)} className="form-input" /></div>
                      <div><label className="mb-1 block text-xs font-medium text-slate-600">메모</label><textarea value={editForm.memo || ''} onChange={(e) => setEditForm((prev) => prev ? { ...prev, memo: e.target.value } : prev)} rows={3} className="form-input" /></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateMut.mutate({ id: row.id, data: { ...editForm, period: editForm.period.trim(), memo: editForm.memo?.trim() || null } })} className="primary-btn">저장</button>
                      <button onClick={() => { setEditingId(null); setEditForm(null) }} className="secondary-btn">취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{row.report_target} · {row.period}</p>
                      <div className="flex items-center gap-1">
                      {badge && <span className={badge.className}>{badge.text}</span>}
                        <span className={statusBadgeClass(row.status)}>{labelStatus(row.status)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">조합: {row.fund_name || '미지정'} | 마감일: {formatDate(row.due_date)} | 제출일: {formatDate(row.submitted_date)}</p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">메모</label>
                      <textarea value={row.memo || ''} readOnly rows={3} className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700" />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => {
                          setEditingId(row.id)
                          setEditForm({
                            report_target: row.report_target,
                            fund_id: row.fund_id,
                            period: row.period,
                            due_date: row.due_date,
                            status: row.status,
                            submitted_date: row.submitted_date,
                            task_id: row.task_id,
                            memo: row.memo,
                          })
                        }}
                        className="secondary-btn"
                      >
                        수정
                      </button>
                      <button onClick={() => { if (confirm('이 보고 기록을 삭제하시겠습니까?')) deleteMut.mutate(row.id) }} className="danger-btn">삭제</button>
                      <button
                        onClick={() => setOpenPreCheckId((prev) => (prev === row.id ? null : row.id))}
                        className={`secondary-btn ${openPreCheckId === row.id ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}
                      >
                        사전 검증
                      </button>
                    </div>

                    {openPreCheckId === row.id && (
                      <div className="mt-2 space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">보고서 사전 검증</p>
                            <p className="text-xs text-slate-500">법적 오류, 교차 검증, 가이드라인, 계약 일치성을 점검합니다.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {latestPreCheck && (
                              <span className={preCheckStatusBadgeClass(latestPreCheck.overall_status)}>
                                {latestPreCheck.overall_status.toUpperCase()}
                              </span>
                            )}
                            <button
                              className="primary-btn btn-sm"
                              disabled={runPreCheckMut.isPending || !row.fund_id}
                              onClick={() => runPreCheckMut.mutate(row.id)}
                            >
                              {runPreCheckMut.isPending ? '검증 실행 중...' : '검증 실행'}
                            </button>
                          </div>
                        </div>

                        {!row.fund_id && (
                          <p className="text-xs text-amber-700">조합이 지정된 보고서에서만 사전 검증을 실행할 수 있습니다.</p>
                        )}

                        {isPreChecksLoading ? (
                          <p className="text-xs text-slate-500">검증 이력을 불러오는 중입니다...</p>
                        ) : latestPreCheck ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                              <div className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="text-[11px] text-slate-500">오류</p>
                                <p className="text-base font-semibold text-red-600">{latestPreCheck.total_errors}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="text-[11px] text-slate-500">경고</p>
                                <p className="text-base font-semibold text-amber-600">{latestPreCheck.total_warnings}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="text-[11px] text-slate-500">정보</p>
                                <p className="text-base font-semibold text-blue-600">{latestPreCheck.total_info}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="text-[11px] text-slate-500">시정 Task</p>
                                <p className="text-base font-semibold text-slate-800">{latestPreCheck.tasks_created}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              {renderFindingGroup('Type 1 · 법적 오류', latestPreCheck.legal_check)}
                              {renderFindingGroup('Type 2 · 교차 검증', latestPreCheck.cross_check)}
                              {renderFindingGroup('Type 3 · 가이드라인', latestPreCheck.guideline_check)}
                              {renderFindingGroup('Type 4 · 계약 일치성', latestPreCheck.contract_check)}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              최근 점검: {latestPreCheck.checked_at ? new Date(latestPreCheck.checked_at).toLocaleString('ko-KR') : '-'}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">검증 이력이 없습니다. 검증 실행 버튼으로 첫 점검을 수행하세요.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}




