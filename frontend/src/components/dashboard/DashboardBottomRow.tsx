import type { ActiveWorkflow, DashboardDeadlineItem, DashboardPipelineResponse } from '../../lib/api'
import ActiveWorkflows from './ActiveWorkflows'
import InvestmentPipeline from './InvestmentPipeline'
import ReportDocDeadlines from './ReportDocDeadlines'

interface DashboardBottomRowProps {
  pipeline: DashboardPipelineResponse
  workflows: ActiveWorkflow[]
  weekDeadlines: DashboardDeadlineItem[]
  onNavigate: (path: string) => void
}

export default function DashboardBottomRow({
  pipeline,
  workflows,
  weekDeadlines,
  onNavigate,
}: DashboardBottomRowProps) {
  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <InvestmentPipeline pipeline={pipeline} onNavigate={onNavigate} />
      <ActiveWorkflows workflows={workflows} onNavigate={onNavigate} />
      <ReportDocDeadlines weekDeadlines={weekDeadlines} onNavigate={onNavigate} />
    </section>
  )
}
