import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBizReport,
  createTask,
  deleteBizReport,
  fetchBizReports,
  fetchFunds,
  fetchTasks,
  updateBizReport,
  type BizReport,
  type BizReportInput,
  type Fund,
  type Task,
} from '../lib/api'
import { formatKRW, labelStatus } from '../lib/labels'
import { useToast } from '../contexts/ToastContext'

interface FilterState {
  fund_id: number | null
  year: number | null
  status: string
}

const STATUS_OPTIONS = ['작성중', '검토중', '완료']

const EMPTY_FILTERS: FilterState = {
  fund_id: null,
  year: null,
  status: '',
}

const EMPTY_INPUT: BizReportInput = {
  fund_id: 0,
  report_year: new Date().getFullYear(),
  status: '작성중',
  submission_date: null,
  total_commitment: null,
  total_paid_in: null,
  total_invested: null,
  total_distributed: null,
  fund_nav: null,
  irr: null,
  tvpi: null,
  dpi: null,
  market_overview: '',
  portfolio_summary: '',
  investment_activity: '',
  key_issues: '',
  outlook: '',
  memo: '',
}

function numInput(value: number | null | undefined): string {
  return value == null ? '' : String(value)
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function ReportForm({
  title,
  funds,
  form,
  loading,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string
  funds: Fund[]
  form: BizReportInput
  loading: boolean
  onChange: (next: BizReportInput) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <select
          value={form.fund_id || ''}
          onChange={(e) => onChange({ ...form, fund_id: Number(e.target.value) || 0 })}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">조합 선택</option>
          {funds.map((fund) => (
            <option key={fund.id} value={fund.id}>{fund.name}</option>
          ))}
        </select>

        <input
          type="number"
          value={form.report_year}
          onChange={(e) => onChange({ ...form, report_year: Number(e.target.value || new Date().getFullYear()) })}
          className="rounded border px-2 py-1 text-sm"
          placeholder="보고 연도"
        />

        <select
          value={form.status || '작성중'}
          onChange={(e) => onChange({ ...form, status: e.target.value })}
          className="rounded border px-2 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>

        <input
          type="date"
          value={form.submission_date || ''}
          onChange={(e) => onChange({ ...form, submission_date: e.target.value || null })}
          className="rounded border px-2 py-1 text-sm"
        />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
        <input type="number" value={numInput(form.total_commitment)} onChange={(e) => onChange({ ...form, total_commitment: toNumber(e.target.value) })} className="rounded border px-2 py-1 text-sm" placeholder="총 약정액" />
        <input type="number" value={numInput(form.total_paid_in)} onChange={(e) => onChange({ ...form, total_paid_in: toNumber(e.target.value) })} className="rounded border px-2 py-1 text-sm" placeholder="총 납입액" />
        <input type="number" value={numInput(form.total_invested)} onChange={(e) => onChange({ ...form, total_invested: toNumber(e.target.value) })} className="rounded border px-2 py-1 text-sm" placeholder="총 투자액" />
        <input type="number" value={numInput(form.total_distributed)} onChange={(e) => onChange({ ...form, total_distributed: toNumber(e.target.value) })} className="rounded border px-2 py-1 text-sm" placeholder="총 분배액" />
        <input type="number" value={numInput(form.fund_nav)} onChange={(e) => onChange({ ...form, fund_nav: toNumber(e.target.value) })} className="rounded border px-2 py-1 text-sm" placeholder="NAV" />
        <input type="number" step="0.01" value={numInput(form.irr)} onChange={(e) => onChange({ ...form, irr: toNumber(e.target.value) })} className="rounded border px-2 py-1 text-sm" placeholder="IRR(%)" />
        <input type="number" step="0.01" value={numInput(form.tvpi)} onChange={(e) => onChange({ ...form, tvpi: toNumber(e.target.value) })} className="rounded border px-2 py-1 text-sm" placeholder="TVPI(x)" />
        <input type="number" step="0.01" value={numInput(form.dpi)} onChange={(e) => onChange({ ...form, dpi: toNumber(e.target.value) })} className="rounded border px-2 py-1 text-sm" placeholder="DPI(x)" />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <textarea value={form.market_overview || ''} onChange={(e) => onChange({ ...form, market_overview: e.target.value })} rows={3} className="rounded border px-2 py-1 text-sm" placeholder="시장 현황" />
        <textarea value={form.portfolio_summary || ''} onChange={(e) => onChange({ ...form, portfolio_summary: e.target.value })} rows={3} className="rounded border px-2 py-1 text-sm" placeholder="포트폴리오 요약" />
        <textarea value={form.investment_activity || ''} onChange={(e) => onChange({ ...form, investment_activity: e.target.value })} rows={3} className="rounded border px-2 py-1 text-sm" placeholder="투자 활동" />
        <textarea value={form.key_issues || ''} onChange={(e) => onChange({ ...form, key_issues: e.target.value })} rows={3} className="rounded border px-2 py-1 text-sm" placeholder="주요 이슈" />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <textarea value={form.outlook || ''} onChange={(e) => onChange({ ...form, outlook: e.target.value })} rows={3} className="rounded border px-2 py-1 text-sm" placeholder="향후 계획" />
        <textarea value={form.memo || ''} onChange={(e) => onChange({ ...form, memo: e.target.value })} rows={3} className="rounded border px-2 py-1 text-sm" placeholder="메모" />
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={onSubmit} disabled={loading} className="primary-btn">
          {loading ? '저장 중...' : '저장'}
        </button>
        <button onClick={onCancel} className="secondary-btn">취소</button>
      </div>
    </div>
  )
}

export default function BizReportsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [showCreate, setShowCreate] = useState(false)
  const [newReport, setNewReport] = useState<BizReportInput>(EMPTY_INPUT)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<BizReportInput | null>(null)

  const params = useMemo(
    () => ({
      fund_id: filters.fund_id || undefined,
      year: filters.year || undefined,
      status: filters.status || undefined,
    }),
    [filters],
  )

  const { data: funds = [] } = useQuery<Fund[]>({ queryKey: ['funds'], queryFn: fetchFunds })
  const { data: reports, isLoading } = useQuery<BizReport[]>({
    queryKey: ['bizReports', params],
    queryFn: () => fetchBizReports(params),
  })
  const { data: lpReportTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', { category: 'LP보고' }],
    queryFn: () => fetchTasks({ category: 'LP보고' }),
  })

  const createMut = useMutation({
    mutationFn: (data: BizReportInput) => createBizReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      setShowCreate(false)
      setNewReport(EMPTY_INPUT)
      addToast('success', '영업보고를 등록했습니다.')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BizReportInput> }) => updateBizReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      setEditingId(null)
      setEditForm(null)
      addToast('success', '영업보고를 수정했습니다.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteBizReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bizReports'] })
      addToast('success', '영업보고를 삭제했습니다.')
    },
  })

  const createTaskMut = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      addToast('success', '업무가 생성되었습니다.')
    },
  })

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">영업보고</h2>
          <p className="page-subtitle">조합 단위 연간 영업보고를 작성하고 관리합니다.</p>
        </div>
        <button onClick={() => setShowCreate((prev) => !prev)} className="primary-btn">+ 영업보고 작성</button>
      </div>

      <div className="card-base space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            value={filters.fund_id || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, fund_id: Number(e.target.value) || null }))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">전체 조합</option>
            {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
          </select>

          <input
            type="number"
            value={filters.year || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, year: Number(e.target.value) || null }))}
            className="rounded border px-2 py-1 text-sm"
            placeholder="연도"
          />

          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">전체 상태</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>

          <button onClick={() => setFilters(EMPTY_FILTERS)} className="secondary-btn">필터 초기화</button>
        </div>
      </div>

      {showCreate && (
        <ReportForm
          title="신규 영업보고"
          funds={funds}
          form={newReport}
          loading={createMut.isPending}
          onChange={setNewReport}
          onSubmit={() => {
            if (!newReport.fund_id || !newReport.report_year) return
            createMut.mutate({
              ...newReport,
              market_overview: newReport.market_overview?.trim() || null,
              portfolio_summary: newReport.portfolio_summary?.trim() || null,
              investment_activity: newReport.investment_activity?.trim() || null,
              key_issues: newReport.key_issues?.trim() || null,
              outlook: newReport.outlook?.trim() || null,
              memo: newReport.memo?.trim() || null,
            })
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {editingId && editForm && (
        <ReportForm
          title="영업보고 수정"
          funds={funds}
          form={editForm}
          loading={updateMut.isPending}
          onChange={(next) => setEditForm(next)}
          onSubmit={() => {
            updateMut.mutate({
              id: editingId,
              data: {
                ...editForm,
                market_overview: editForm.market_overview?.trim() || null,
                portfolio_summary: editForm.portfolio_summary?.trim() || null,
                investment_activity: editForm.investment_activity?.trim() || null,
                key_issues: editForm.key_issues?.trim() || null,
                outlook: editForm.outlook?.trim() || null,
                memo: editForm.memo?.trim() || null,
              },
            })
          }}
          onCancel={() => {
            setEditingId(null)
            setEditForm(null)
          }}
        />
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
          </div>
        ) : !(reports?.length) ? (
          <div className="empty-state">
            <p className="text-sm">영업보고가 없습니다.</p>
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="card-base">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800">{report.fund_name || `조합 #${report.fund_id}`} | {report.report_year}년 영업보고</p>
                <div className="flex items-center gap-1">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{labelStatus(report.status)}</span>
                  <button
                    onClick={() =>
                      createTaskMut.mutate({
                        title: `${report.fund_name || `조합 #${report.fund_id}`} ${report.report_year} 영업보고서 작성`,
                        fund_id: report.fund_id,
                        category: 'LP보고',
                        quadrant: 'Q1',
                        deadline: report.submission_date || null,
                      })
                    }
                    className="text-xs text-blue-600 hover:underline"
                  >
                    업무 추가
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(report.id)
                      setEditForm({
                        fund_id: report.fund_id,
                        report_year: report.report_year,
                        status: report.status,
                        submission_date: report.submission_date,
                        total_commitment: report.total_commitment,
                        total_paid_in: report.total_paid_in,
                        total_invested: report.total_invested,
                        total_distributed: report.total_distributed,
                        fund_nav: report.fund_nav,
                        irr: report.irr,
                        tvpi: report.tvpi,
                        dpi: report.dpi,
                        market_overview: report.market_overview,
                        portfolio_summary: report.portfolio_summary,
                        investment_activity: report.investment_activity,
                        key_issues: report.key_issues,
                        outlook: report.outlook,
                        memo: report.memo,
                      })
                    }}
                    className="secondary-btn"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('이 영업보고를 삭제하시겠습니까?')) {
                        deleteMut.mutate(report.id)
                      }
                    }}
                    className="danger-btn"
                  >
                    삭제
                  </button>
                </div>
              </div>

              <p className="mt-1 text-xs text-gray-500">제출일: {report.submission_date || '-'} </p>

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3 text-sm">
                <div className="rounded bg-gray-50 p-2">약정: {formatKRW(report.total_commitment)}</div>
                <div className="rounded bg-gray-50 p-2">납입: {formatKRW(report.total_paid_in)}</div>
                <div className="rounded bg-gray-50 p-2">투자: {formatKRW(report.total_invested)}</div>
                <div className="rounded bg-gray-50 p-2">분배: {formatKRW(report.total_distributed)}</div>
                <div className="rounded bg-gray-50 p-2">IRR: {report.irr != null ? `${report.irr}%` : '-'}</div>
                <div className="rounded bg-gray-50 p-2">TVPI / DPI: {report.tvpi ?? '-'}x / {report.dpi ?? '-'}x</div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <p className="rounded bg-gray-50 p-2 text-sm text-gray-700"><strong>시장:</strong> {report.market_overview || '-'}</p>
                <p className="rounded bg-gray-50 p-2 text-sm text-gray-700"><strong>포트폴리오:</strong> {report.portfolio_summary || '-'}</p>
                <p className="rounded bg-gray-50 p-2 text-sm text-gray-700"><strong>투자활동:</strong> {report.investment_activity || '-'}</p>
                <p className="rounded bg-gray-50 p-2 text-sm text-gray-700"><strong>이슈/전망:</strong> {[report.key_issues, report.outlook].filter(Boolean).join(' / ') || '-'}</p>
              </div>
              {lpReportTasks.filter((task) => task.fund_id === report.fund_id && task.category === 'LP보고').length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <p className="mb-1 text-xs font-medium text-gray-500">연관 업무</p>
                  <div className="space-y-1">
                    {lpReportTasks
                      .filter((task) => task.fund_id === report.fund_id && task.category === 'LP보고')
                      .map((task) => (
                        <div key={task.id} className="flex items-center gap-2 text-xs">
                          <span className={task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}>
                            {task.title}
                          </span>
                          {task.estimated_time && <span className="text-gray-400">{task.estimated_time}</span>}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
