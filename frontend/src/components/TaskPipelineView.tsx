import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarDays, Clock3, Inbox } from 'lucide-react'

import type { ActiveWorkflow, Task } from '../lib/api'

interface TaskPipelineViewProps {
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  upcomingTasks: Task[]
  noDeadlineTasks: Task[]
  activeWorkflows: ActiveWorkflow[]
  onClickTask: (task: Task, options?: { editable?: boolean }) => void
  onClickWorkflow: (wf: ActiveWorkflow) => void
  fullScreen?: boolean
  embedded?: boolean
  heightClass?: string
  layoutPreset?: 'default' | 'dashboard'
}

type Accent = {
  border: string
  tint: string
  text: string
}

const CARD_ACCENTS: Accent[] = [
  { border: 'border-l-blue-400', tint: 'bg-white', text: 'text-[#1a3660]' },
  { border: 'border-l-indigo-400', tint: 'bg-white', text: 'text-indigo-700' },
  { border: 'border-l-emerald-400', tint: 'bg-white', text: 'text-emerald-700' },
  { border: 'border-l-amber-400', tint: 'bg-white', text: 'text-amber-700' },
  { border: 'border-l-slate-400', tint: 'bg-white', text: 'text-[#0f1f3d]' },
]

const DEFAULT_ACCENT: Accent = {
  border: 'border-l-gray-300',
  tint: 'bg-white',
  text: 'text-[#64748b]',
}

type StageKey = 'overdue' | 'today' | 'thisWeek' | 'upcoming' | 'waiting'
type ItemType = 'task' | 'workflow'
type RelationType = 'workflow' | 'investment' | 'fund' | 'gp' | 'company' | 'noticeReport'
type LinkPriority = 'primary' | 'secondary'
type ChainRole = 'prev' | 'current' | 'next'

type RelationToken = {
  token: string
  type: RelationType
  weight: number
}

type PipelineItem = {
  key: string
  type: ItemType
  stageKey: StageKey
  stageIndex: number
  order: number
  workflowInstanceId: number | null
  workflowStepOrder: number | null
  task?: Task
  workflow?: ActiveWorkflow
}

type LinkCandidate = {
  fromKey: string
  toKey: string
  fromStageKey: StageKey
  toStageKey: StageKey
  type: RelationType
  weight: number
  priority: LinkPriority
  isTodayForward: boolean
}

type LinkPath = LinkCandidate & {
  d: string
}

type WorkflowChainMeta = {
  workflowInstanceId: number
  role: ChainRole | null
  prevKey: string | null
  nextKey: string | null
  nextLabel: string | null
}

type PipelineColumn = {
  key: StageKey
  label: string
  icon: typeof Inbox
  colorClass: string
  borderClass: string
  subLabel: string
  tasks: Task[]
  workflows: ActiveWorkflow[]
  compactThreshold: number
  editable: boolean
}

const RELATION_STROKE: Record<RelationType, string> = {
  workflow: '#558ef8',
  investment: '#3f79e0',
  fund: '#0f1f3d',
  gp: '#1a3660',
  company: '#64748b',
  noticeReport: '#0f1f3d',
}

function areLinkPathsEqual(prev: LinkPath[], next: LinkPath[]): boolean {
  if (prev.length !== next.length) return false
  for (let index = 0; index < prev.length; index += 1) {
    const a = prev[index]
    const b = next[index]
    if (a.fromKey !== b.fromKey || a.toKey !== b.toKey || a.type !== b.type || a.d !== b.d) {
      return false
    }
  }
  return true
}

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case '투자실행':
      return 'bg-red-50 text-red-700'
    case 'LP보고':
      return 'bg-green-50 text-green-700'
    case '사후관리':
      return 'bg-amber-50 text-amber-700'
    case '규약/총회':
      return 'bg-indigo-50 text-indigo-700'
    case '서류관리':
      return 'bg-orange-50 text-orange-700'
    default:
      return 'bg-[#f5f9ff] text-[#64748b]'
  }
}

function groupByCategory(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.category || '일반'
    const list = groups.get(key) || []
    list.push(task)
    groups.set(key, list)
  }
  return groups
}

function flattenTasksForDisplay(tasks: Task[]): Task[] {
  const flattened: Task[] = []
  for (const [, groupedTasks] of groupByCategory(tasks).entries()) {
    flattened.push(...groupedTasks)
  }
  return flattened
}

function parseProgress(progress: string): { percent: number; current: number; total: number } {
  const match = progress.match(/(\d+)\/(\d+)/)
  if (!match) return { percent: 0, current: 0, total: 0 }
  const current = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return { percent, current, total }
}

function getAccent(seed: string | null | undefined): Accent {
  if (!seed) return DEFAULT_ACCENT
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return CARD_ACCENTS[hash % CARD_ACCENTS.length]
}

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.includes('T')) return value.slice(0, 10)
  if (value.length >= 10) return value.slice(0, 10)
  return null
}

function localTodayIso(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sundayIso(baseIso: string): string {
  const base = new Date(`${baseIso}T00:00:00`)
  const day = base.getDay()
  const diffToSunday = day === 0 ? 0 : 7 - day
  const sunday = new Date(base)
  sunday.setDate(base.getDate() + diffToSunday)
  return sunday.toISOString().slice(0, 10)
}

function taskDeadlineBorderClass(task: Task, todayIso: string, weekEndIso: string): string {
  const deadlineIso = toDateOnly(task.deadline)
  if (!deadlineIso) return 'border-l-gray-300'
  if (deadlineIso < todayIso) return 'border-l-red-500'
  if (deadlineIso === todayIso) return 'border-l-orange-500'
  if (deadlineIso <= weekEndIso) return 'border-l-amber-400'
  return 'border-l-blue-400'
}

function workflowSortKey(workflow: ActiveWorkflow): string {
  const dateKey = toDateOnly(workflow.next_step_date) || '9999-12-31'
  return `${dateKey}-${String(workflow.id).padStart(10, '0')}`
}

function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized.length ? normalized : null
}

function uniqueRelations(relations: RelationToken[]): RelationToken[] {
  const map = new Map<string, RelationToken>()
  for (const relation of relations) {
    const existing = map.get(relation.token)
    if (!existing || relation.weight > existing.weight) {
      map.set(relation.token, relation)
    }
  }
  return [...map.values()]
}

function taskRelations(task: Task): RelationToken[] {
  const relations: RelationToken[] = []

  if (task.workflow_instance_id) {
    relations.push({ token: `wf:${task.workflow_instance_id}`, type: 'workflow', weight: 130 })
  }
  if (task.investment_id) {
    relations.push({ token: `investment:${task.investment_id}`, type: 'investment', weight: 120 })
  }
  if (task.fund_id) {
    relations.push({ token: `fund:${task.fund_id}`, type: 'fund', weight: 110 })
  }
  if (task.gp_entity_id) {
    relations.push({ token: `gp:${task.gp_entity_id}`, type: 'gp', weight: 110 })
  }

  const fundName = normalizeName(task.fund_name)
  if (fundName) relations.push({ token: `fundName:${fundName}`, type: 'fund', weight: 70 })

  const gpName = normalizeName(task.gp_entity_name)
  if (gpName) relations.push({ token: `gpName:${gpName}`, type: 'gp', weight: 70 })

  const companyName = normalizeName(task.company_name)
  if (companyName) relations.push({ token: `companyName:${companyName}`, type: 'company', weight: 70 })

  if (task.is_notice || task.is_report) {
    if (task.investment_id) relations.push({ token: `noticeReportInvestment:${task.investment_id}`, type: 'noticeReport', weight: 100 })
    if (task.fund_id) relations.push({ token: `noticeReportFund:${task.fund_id}`, type: 'noticeReport', weight: 95 })
    if (task.gp_entity_id) relations.push({ token: `noticeReportGp:${task.gp_entity_id}`, type: 'noticeReport', weight: 95 })
  }

  return uniqueRelations(relations)
}

function workflowRelations(workflow: ActiveWorkflow): RelationToken[] {
  const relations: RelationToken[] = [{ token: `wf:${workflow.id}`, type: 'workflow', weight: 125 }]

  const fundName = normalizeName(workflow.fund_name)
  if (fundName) relations.push({ token: `fundName:${fundName}`, type: 'fund', weight: 75 })

  const gpName = normalizeName(workflow.gp_entity_name)
  if (gpName) relations.push({ token: `gpName:${gpName}`, type: 'gp', weight: 75 })

  const companyName = normalizeName(workflow.company_name)
  if (companyName) relations.push({ token: `companyName:${companyName}`, type: 'company', weight: 75 })

  return uniqueRelations(relations)
}

function nextLabelForItem(item: PipelineItem | undefined): string | null {
  if (!item) return null
  if (item.type === 'workflow') {
    return item.workflow?.next_step || item.workflow?.name || null
  }
  return item.task?.title || null
}

function chainRoleBadge(role: ChainRole | null): { label: string; className: string } | null {
  if (role === 'current') return { label: '현재', className: 'bg-[#f5f9ff] text-[#1a3660]' }
  if (role === 'next') return { label: '다음', className: 'bg-[#fff7d6] text-[#624100]' }
  if (role === 'prev') return { label: '이전', className: 'bg-white text-[#64748b] border border-[#d8e5fb]' }
  return null
}

export default function TaskPipelineView({
  todayTasks,
  tomorrowTasks,
  thisWeekTasks,
  upcomingTasks,
  noDeadlineTasks,
  activeWorkflows,
  onClickTask,
  onClickWorkflow,
  fullScreen = false,
  embedded = false,
  heightClass,
  layoutPreset = 'default',
}: TaskPipelineViewProps) {
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null)
  const pipelineRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [linkPaths, setLinkPaths] = useState<LinkPath[]>([])
  const isDashboardPreset = layoutPreset === 'dashboard'
  const isDashboardEmbedded = isDashboardPreset && embedded

  const todayIso = localTodayIso()
  const weekEndIso = sundayIso(todayIso)
  const activeWorkflowIds = new Set(activeWorkflows.map((workflow) => workflow.id))

  const filterWorkflowTasks = (tasks: Task[]) =>
    tasks.filter((task) => !(task.workflow_instance_id && activeWorkflowIds.has(task.workflow_instance_id)))

  const mergedTaskMap = new Map<number, Task>()
  for (const sourceTasks of [todayTasks, tomorrowTasks, thisWeekTasks, upcomingTasks, noDeadlineTasks]) {
    for (const task of sourceTasks) {
      if (task.status === 'completed') continue
      mergedTaskMap.set(task.id, task)
    }
  }
  const mergedTasks = [...mergedTaskMap.values()]
  const stageTargetTasks = filterWorkflowTasks(mergedTasks)

  const overdueStageTasks = stageTargetTasks.filter((task) => {
    const deadlineIso = toDateOnly(task.deadline)
    return !!deadlineIso && deadlineIso < todayIso
  })
  const todayStageTasks = stageTargetTasks.filter((task) => {
    const deadlineIso = toDateOnly(task.deadline)
    return deadlineIso === todayIso
  })
  const thisWeekStageTasks = stageTargetTasks.filter((task) => {
    const deadlineIso = toDateOnly(task.deadline)
    return !!deadlineIso && deadlineIso > todayIso && deadlineIso <= weekEndIso
  })
  const upcomingStageTasks = stageTargetTasks.filter((task) => {
    const deadlineIso = toDateOnly(task.deadline)
    return !!deadlineIso && deadlineIso > weekEndIso
  })
  const waitingTasks = stageTargetTasks.filter((task) => !toDateOnly(task.deadline))

  const workflowByStage = new Map<StageKey, ActiveWorkflow[]>([
    ['overdue', []],
    ['today', []],
    ['thisWeek', []],
    ['upcoming', []],
    ['waiting', []],
  ])

  const resolveWorkflowStage = (workflow: ActiveWorkflow): StageKey => {
    const nextDate = toDateOnly(workflow.next_step_date)
    if (!nextDate) return 'waiting'
    if (nextDate < todayIso) return 'overdue'
    if (nextDate === todayIso) return 'today'
    if (nextDate <= weekEndIso) return 'thisWeek'
    return 'upcoming'
  }

  for (const workflow of activeWorkflows) {
    const stage = resolveWorkflowStage(workflow)
    const list = workflowByStage.get(stage) || []
    list.push(workflow)
    workflowByStage.set(stage, list)
  }

  for (const [stage, list] of workflowByStage.entries()) {
    workflowByStage.set(stage, [...list].sort((a, b) => workflowSortKey(a).localeCompare(workflowSortKey(b))))
  }

  const waitingLane = useMemo<PipelineColumn>(() => ({
    key: 'waiting' as const,
    label: '대기 (기한 미배정)',
    icon: Inbox,
    colorClass: 'text-[#0f1f3d]',
    borderClass: 'border-[#d8e5fb]',
    subLabel: '',
    tasks: waitingTasks,
    workflows: workflowByStage.get('waiting') ?? [],
    compactThreshold: 7,
    editable: true,
  }), [waitingTasks, workflowByStage])

  const waitingCount = waitingLane.tasks.length + waitingLane.workflows.length
  const waitingWorkflowCount = waitingLane.workflows.length
  const waitingTaskCount = waitingLane.tasks.length
  const [isWaitingCollapsed, setIsWaitingCollapsed] = useState(false)
  const waitingLanePaddingClass = isDashboardEmbedded ? 'p-1.5' : embedded ? 'p-2' : 'p-2.5'
  const waitingCardWidthClass = isDashboardEmbedded
    ? 'min-w-[148px] max-w-[168px]'
    : embedded
      ? 'min-w-[176px] max-w-[208px]'
      : 'min-w-[224px] max-w-[260px]'
  const waitingCardPaddingClass = isDashboardEmbedded ? 'px-2 py-1' : embedded ? 'px-2.5 py-1.5' : 'px-3 py-2'
  const stageGridClass = isDashboardPreset
    ? 'grid min-h-0 flex-1 grid-cols-2 gap-2.5'
    : 'grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'
  const stageColumnPaddingClass = isDashboardPreset ? 'p-2' : 'p-2.5'

  useEffect(() => {
    if (waitingCount === 0) {
      setIsWaitingCollapsed(true)
      return
    }
    setIsWaitingCollapsed(isDashboardPreset ? true : embedded)
  }, [waitingCount, embedded, isDashboardPreset])
  const stageColumns = useMemo<PipelineColumn[]>(() => [
    {
      key: 'overdue' as const,
      label: '지연',
      icon: AlertTriangle,
      colorClass: 'text-red-700',
      borderClass: 'border-red-200',
      subLabel: '',
      tasks: overdueStageTasks,
      workflows: workflowByStage.get('overdue') ?? [],
      compactThreshold: 5,
      editable: false,
    },
    {
      key: 'today' as const,
      label: '오늘',
      icon: Clock3,
      colorClass: 'text-orange-700',
      borderClass: 'border-orange-200',
      subLabel: `내일 ${tomorrowTasks.length}건`,
      tasks: todayStageTasks,
      workflows: workflowByStage.get('today') ?? [],
      compactThreshold: 5,
      editable: false,
    },
    {
      key: 'thisWeek' as const,
      label: '이번 주',
      icon: CalendarDays,
      colorClass: 'text-amber-700',
      borderClass: 'border-amber-200',
      subLabel: '',
      tasks: thisWeekStageTasks,
      workflows: workflowByStage.get('thisWeek') ?? [],
      compactThreshold: 5,
      editable: false,
    },
    {
      key: 'upcoming' as const,
      label: '예정',
      icon: ArrowRight,
      colorClass: 'text-[#1a3660]',
      borderClass: 'border-[#c5d8fb]',
      subLabel: '',
      tasks: upcomingStageTasks,
      workflows: workflowByStage.get('upcoming') ?? [],
      compactThreshold: 5,
      editable: false,
    },
  ], [
    overdueStageTasks,
    thisWeekStageTasks,
    todayStageTasks,
    tomorrowTasks.length,
    upcomingStageTasks,
    workflowByStage,
  ])

  const pipelineColumnsForLinks = useMemo(
    () => [waitingLane, ...stageColumns],
    [waitingLane, stageColumns],
  )

  const pipelineItems = useMemo(() => {
    const items: PipelineItem[] = []

    pipelineColumnsForLinks.forEach((column, stageIndex) => {
      let order = 0

      for (const workflow of column.workflows) {
        const { current, total } = parseProgress(workflow.progress)
        const inferredStepOrder = total > 0 ? Math.min(total, Math.max(1, current + 1)) : null
        items.push({
          key: `wf-${workflow.id}`,
          type: 'workflow',
          stageKey: column.key,
          stageIndex,
          order,
          workflowInstanceId: workflow.id,
          workflowStepOrder: inferredStepOrder,
          workflow,
        })
        order += 1
      }

      const isCompact = column.compactThreshold > 0 && column.tasks.length > column.compactThreshold
      const displayTasks = isCompact ? column.tasks : flattenTasksForDisplay(column.tasks)

      for (const task of displayTasks) {
        items.push({
          key: `task-${task.id}`,
          type: 'task',
          stageKey: column.key,
          stageIndex,
          order,
          workflowInstanceId: task.workflow_instance_id ?? null,
          workflowStepOrder: task.workflow_step_order ?? null,
          task,
        })
        order += 1
      }
    })

    return items
  }, [pipelineColumnsForLinks])

  const { chainMetaByKey, primaryLinks, todayFocusKeys } = useMemo(() => {
    const nextMetaByKey = new Map<string, WorkflowChainMeta>()
    const nextPrimaryLinks = new Map<string, LinkCandidate>()
    const nextTodayFocusKeys = new Set<string>()
    const byWorkflow = new Map<number, PipelineItem[]>()

    for (const item of pipelineItems) {
      if (item.stageKey === 'today') nextTodayFocusKeys.add(item.key)
      if (!item.workflowInstanceId) continue
      const list = byWorkflow.get(item.workflowInstanceId) || []
      list.push(item)
      byWorkflow.set(item.workflowInstanceId, list)
    }

    for (const [workflowInstanceId, members] of byWorkflow.entries()) {
      const ordered = [...members].sort((a, b) => {
        const stepOrderA = a.workflowStepOrder ?? Number.MAX_SAFE_INTEGER
        const stepOrderB = b.workflowStepOrder ?? Number.MAX_SAFE_INTEGER
        if (stepOrderA !== stepOrderB) return stepOrderA - stepOrderB
        if (a.stageIndex !== b.stageIndex) return a.stageIndex - b.stageIndex
        if (a.type !== b.type) return a.type === 'workflow' ? -1 : 1
        return a.order - b.order
      })

      if (ordered.length === 0) continue

      let currentIndex = ordered.findIndex((item) => item.type === 'workflow')
      if (currentIndex < 0) currentIndex = ordered.findIndex((item) => item.stageKey === 'today')
      if (currentIndex < 0) currentIndex = 0

      for (let index = 0; index < ordered.length; index += 1) {
        const item = ordered[index]
        const prev = ordered[index - 1]
        const next = ordered[index + 1]
        const role: ChainRole | null =
          index < currentIndex ? 'prev' : index === currentIndex ? 'current' : index === currentIndex + 1 ? 'next' : null
        const fallbackNext = item.type === 'workflow' ? item.workflow?.next_step || null : null
        const nextLabel = nextLabelForItem(next) || fallbackNext

        nextMetaByKey.set(item.key, {
          workflowInstanceId,
          role,
          prevKey: prev?.key || null,
          nextKey: next?.key || null,
          nextLabel,
        })

        if (!next) continue
        const pairKey = `${item.key}->${next.key}`
        nextPrimaryLinks.set(pairKey, {
          fromKey: item.key,
          toKey: next.key,
          fromStageKey: item.stageKey,
          toStageKey: next.stageKey,
          type: 'workflow',
          weight: 220,
          priority: 'primary',
          isTodayForward: item.stageKey === 'today' && next.stageIndex > item.stageIndex,
        })
      }
    }

    return {
      chainMetaByKey: nextMetaByKey,
      primaryLinks: [...nextPrimaryLinks.values()],
      todayFocusKeys: nextTodayFocusKeys,
    }
  }, [pipelineItems])

  const linkCandidates = useMemo(() => {
    type Participant = {
      itemKey: string
      stageIndex: number
      stageKey: StageKey
      order: number
      type: RelationType
      weight: number
    }

    const byRelation = new Map<string, Participant[]>()

    for (const item of pipelineItems) {
      const relations = item.type === 'task'
        ? taskRelations(item.task!)
        : workflowRelations(item.workflow!)

      for (const relation of relations) {
        const list = byRelation.get(relation.token) || []
        list.push({
          itemKey: item.key,
          stageIndex: item.stageIndex,
          stageKey: item.stageKey,
          order: item.order,
          type: relation.type,
          weight: relation.weight,
        })
        byRelation.set(relation.token, list)
      }
    }

    const bestPairMap = new Map<string, LinkCandidate>()

    for (const participants of byRelation.values()) {
      if (participants.length < 2) continue

      const uniqueByItem = new Map<string, Participant>()
      for (const participant of participants) {
        const existing = uniqueByItem.get(participant.itemKey)
        if (!existing || participant.weight > existing.weight) {
          uniqueByItem.set(participant.itemKey, participant)
        }
      }

      const ordered = [...uniqueByItem.values()].sort((a, b) => {
        if (a.stageIndex !== b.stageIndex) return a.stageIndex - b.stageIndex
        return a.order - b.order
      })

      for (let index = 1; index < ordered.length; index += 1) {
        const from = ordered[index - 1]
        const to = ordered[index]

        if (from.stageIndex === to.stageIndex) continue

        const pairKey = `${from.itemKey}->${to.itemKey}`
        const candidate: LinkCandidate = {
          fromKey: from.itemKey,
          toKey: to.itemKey,
          fromStageKey: from.stageKey,
          toStageKey: to.stageKey,
          type: from.weight >= to.weight ? from.type : to.type,
          weight: Math.max(from.weight, to.weight),
          priority: 'secondary',
          isTodayForward: from.stageKey === 'today' && to.stageIndex > from.stageIndex,
        }

        const existing = bestPairMap.get(pairKey)
        if (!existing || candidate.weight > existing.weight) {
          bestPairMap.set(pairKey, candidate)
        }
      }
    }

    const merged = new Map<string, LinkCandidate>()
    for (const primaryLink of primaryLinks) {
      merged.set(`${primaryLink.fromKey}->${primaryLink.toKey}`, primaryLink)
    }
    for (const secondaryLink of bestPairMap.values()) {
      const pairKey = `${secondaryLink.fromKey}->${secondaryLink.toKey}`
      if (!merged.has(pairKey)) {
        merged.set(pairKey, secondaryLink)
      }
    }
    return [...merged.values()]
  }, [pipelineItems, primaryLinks])

  const activeFocusKeys = useMemo(() => {
    if (!activeCardKey) return null
    const focus = new Set<string>([activeCardKey])
    const chain = chainMetaByKey.get(activeCardKey)
    if (chain?.prevKey) focus.add(chain.prevKey)
    if (chain?.nextKey) focus.add(chain.nextKey)
    return focus
  }, [activeCardKey, chainMetaByKey])

  const recomputeLinkPaths = useCallback(() => {
    const wrapper = pipelineRef.current
    if (!wrapper) {
      setLinkPaths((prev) => (prev.length ? [] : prev))
      return
    }

    const wrapperRect = wrapper.getBoundingClientRect()
    const nextPaths: LinkPath[] = []

    for (const link of linkCandidates) {
      const fromEl = cardRefs.current.get(link.fromKey)
      const toEl = cardRefs.current.get(link.toKey)
      if (!fromEl || !toEl) continue

      const fromRect = fromEl.getBoundingClientRect()
      const toRect = toEl.getBoundingClientRect()

      const startX = roundCoord(fromRect.right - wrapperRect.left)
      const startY = roundCoord(fromRect.top + fromRect.height / 2 - wrapperRect.top)
      const endX = roundCoord(toRect.left - wrapperRect.left)
      const endY = roundCoord(toRect.top + toRect.height / 2 - wrapperRect.top)

      if (endX <= startX) continue

      const distance = endX - startX
      const curve = roundCoord(Math.max(24, Math.min(120, distance * 0.4)))
      const d = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`

      nextPaths.push({ ...link, d })
    }

    setLinkPaths((prev) => (areLinkPathsEqual(prev, nextPaths) ? prev : nextPaths))
  }, [linkCandidates])

  useLayoutEffect(() => {
    recomputeLinkPaths()
  }, [recomputeLinkPaths])

  useLayoutEffect(() => {
    const wrapper = pipelineRef.current
    if (!wrapper) return undefined

    const resizeObserver = new ResizeObserver(() => {
      recomputeLinkPaths()
    })

    resizeObserver.observe(wrapper)
    for (const element of cardRefs.current.values()) {
      resizeObserver.observe(element)
    }

    const onWindowResize = () => recomputeLinkPaths()
    window.addEventListener('resize', onWindowResize)

    return () => {
      window.removeEventListener('resize', onWindowResize)
      resizeObserver.disconnect()
    }
  }, [pipelineItems, recomputeLinkPaths])

  const attachCardRef = useCallback((cardKey: string, node: HTMLButtonElement | null) => {
    if (node) {
      cardRefs.current.set(cardKey, node)
      return
    }
    cardRefs.current.delete(cardKey)
  }, [])

  const cardInteraction = (cardKey: string) => ({
    ref: (node: HTMLButtonElement | null) => attachCardRef(cardKey, node),
    onMouseEnter: () => setActiveCardKey(cardKey),
    onMouseLeave: () => setActiveCardKey((prev) => (prev === cardKey ? null : prev)),
    onFocus: () => setActiveCardKey(cardKey),
    onBlur: () => setActiveCardKey((prev) => (prev === cardKey ? null : prev)),
  })

  const getCardChainMeta = useCallback(
    (cardKey: string, fallbackNext?: string | null) => {
      const chain = chainMetaByKey.get(cardKey)
      const badge = chainRoleBadge(chain?.role ?? null)
      const nextLabel = chain?.nextLabel || fallbackNext || null
      const ringClass =
        chain?.role === 'current'
          ? 'ring-1 ring-[#558ef8]/45'
          : chain?.role === 'next'
            ? 'ring-1 ring-[#c5d8fb]'
            : ''
      return {
        badge,
        nextLabel,
        ringClass,
      }
    },
    [chainMetaByKey],
  )

  return (
    <div className={fullScreen || embedded ? '' : 'card-base'}>
      <div
        ref={pipelineRef}
        className={`relative mx-auto w-full max-w-[1400px] overflow-hidden rounded-2xl border border-[#d8e5fb] bg-white p-3 ${
          heightClass || (fullScreen ? 'h-[calc(100vh-140px)]' : 'h-[620px]')
        }`}
      >
        <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden="true">
          <defs>
            <marker
              id="pipeline-arrow-primary"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="#0f1f3d" />
            </marker>
          </defs>
          {linkPaths.map((link) => {
            const isPrimary = link.priority === 'primary'
            const isRelated = activeFocusKeys
              ? activeFocusKeys.has(link.fromKey) || activeFocusKeys.has(link.toKey)
              : false
            if (activeFocusKeys && !isRelated) return null

            const todayLinked = todayFocusKeys.has(link.fromKey) || todayFocusKeys.has(link.toKey)
            const strokeWidth = activeFocusKeys
              ? isPrimary
                ? 2
                : 1.4
              : isDashboardPreset
                ? isPrimary
                  ? link.isTodayForward
                    ? 2.6
                    : 2
                  : todayLinked
                    ? 1.3
                    : 1.1
                : isPrimary
                  ? link.isTodayForward
                    ? 2.2
                    : 1.5
                  : todayLinked
                    ? 1
                    : 0.9
            const strokeOpacity = activeFocusKeys
              ? isPrimary
                ? 0.74
                : 0.38
              : isDashboardPreset
                ? isPrimary
                  ? link.isTodayForward
                    ? 0.8
                    : 0.56
                  : todayLinked
                    ? 0.28
                    : 0.2
                : isPrimary
                  ? link.isTodayForward
                    ? 0.64
                    : 0.28
                  : todayLinked
                    ? 0.16
                    : 0.09

            return (
              <path
                key={`${link.fromKey}-${link.toKey}`}
                d={link.d}
                fill="none"
                stroke={RELATION_STROKE[link.type]}
                strokeWidth={strokeWidth}
                strokeOpacity={strokeOpacity}
                markerEnd={isPrimary ? 'url(#pipeline-arrow-primary)' : undefined}
                strokeDasharray={link.type === 'noticeReport' || link.priority === 'secondary' ? '3 3' : undefined}
              />
            )
          })}
        </svg>

        <div className="relative z-10 flex h-full min-h-0 flex-col gap-3">
          <div className={`rounded-xl border ${waitingLane.borderClass} bg-[#f5f9ff]/40 ${waitingLanePaddingClass}`}>
            <div className={`${isDashboardPreset ? 'mb-1.5' : 'mb-2'} flex items-center justify-between`}>
              <div className="flex items-center gap-1.5">
                <Inbox size={14} className={waitingLane.colorClass} />
                <p className={`${isDashboardPreset ? 'text-[12px]' : 'text-sm'} font-semibold ${waitingLane.colorClass}`}>{waitingLane.label}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1a3660]">{waitingCount}건</span>
                <button
                  type="button"
                  onClick={() => setIsWaitingCollapsed((prev) => !prev)}
                  className={`rounded border border-[#d8e5fb] bg-white px-2 py-0.5 text-[11px] text-[#64748b] hover:bg-[#f5f9ff] ${embedded ? 'min-w-[54px]' : ''}`}
                >
                  {isWaitingCollapsed ? '펼치기' : '접기'}
                </button>
              </div>
            </div>
            {isWaitingCollapsed ? (
              <button
                type="button"
                onClick={() => setIsWaitingCollapsed(false)}
                className="w-full rounded border border-dashed border-[#bfcff0] bg-white px-3 py-2 text-left text-xs text-[#64748b] hover:bg-[#f5f9ff]"
                >
                {isDashboardPreset ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-[#f5f9ff] px-2 py-0.5 font-semibold text-[#1a3660]">대기 {waitingCount}건</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[#64748b]">워크플로 {waitingWorkflowCount}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[#64748b]">업무 {waitingTaskCount}</span>
                    <span className="ml-auto font-semibold text-[#1a3660]">펼치기</span>
                  </div>
                ) : (
                  <>📥 대기 ({waitingCount}건)</>
                )}
              </button>
            ) : (
              <div className={`flex overflow-x-auto pb-1 ${isDashboardPreset ? 'gap-2' : 'gap-3'}`}>
                {waitingLane.workflows.map((workflow) => {
                  const accent = getAccent(workflow.fund_name || workflow.gp_entity_name || workflow.name)
                  const { percent } = parseProgress(workflow.progress)
                  const cardKey = `wf-${workflow.id}`
                  const chain = getCardChainMeta(cardKey, workflow.next_step || null)

                  return (
                    <button
                      key={cardKey}
                      {...cardInteraction(cardKey)}
                      onClick={() => onClickWorkflow(workflow)}
                      className={`${waitingCardWidthClass} shrink-0 rounded-lg border border-[#d8e5fb] border-l-4 bg-white ${waitingCardPaddingClass} text-left transition-colors hover:border-[#b2cbfb] ${accent.border} ${chain.ringClass}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[12px] font-semibold leading-tight text-[#0f1f3d]">워크플로우: {workflow.name}</p>
                        <div className="flex items-center gap-1">
                          {chain.badge && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${chain.badge.className}`}>{chain.badge.label}</span>}
                          <span className={`shrink-0 text-[11px] ${accent.text}`}>{workflow.progress}</span>
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] leading-tight text-[#0f1f3d]">현재 단계: {workflow.next_step || '다음 단계 확인'}</p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#d8e5fb]">
                        <div className="h-full rounded-full bg-[#558ef8] transition-all duration-300" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[#1a3660]">다음: {chain.nextLabel || '다음 단계 미정'}</p>
                    </button>
                  )
                })}
                {(waitingLane.compactThreshold > 0 && waitingLane.tasks.length > waitingLane.compactThreshold
                  ? waitingLane.tasks
                  : flattenTasksForDisplay(waitingLane.tasks)
                ).map((task) => {
                  const cardKey = `task-${task.id}`
                  const chain = getCardChainMeta(cardKey)
                  return (
                    <button
                      key={cardKey}
                      {...cardInteraction(cardKey)}
                      onClick={() => onClickTask(task, { editable: true })}
                      className={`group relative ${waitingCardWidthClass} shrink-0 rounded-lg border border-[#d8e5fb] bg-white ${waitingCardPaddingClass} text-left transition-colors hover:border-[#bfcff0] ${chain.ringClass}`}
                      title="클릭하여 마감일 배정"
                    >
                      <span className="pointer-events-none absolute left-2 top-0 -translate-y-full rounded bg-[#0f1f3d] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        클릭하여 마감일 배정
                      </span>
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="truncate text-[12px] font-semibold leading-tight text-[#0f1f3d]">{task.title}</p>
                        {chain.badge && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${chain.badge.className}`}>{chain.badge.label}</span>}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#64748b]">
                        <span className="truncate">{task.fund_name || task.gp_entity_name || '일반'}</span>
                        <span className="shrink-0">기한 없음</span>
                      </div>
                      {chain.nextLabel && <p className="mt-1 truncate text-[11px] text-[#1a3660]">다음: {chain.nextLabel}</p>}
                    </button>
                  )
                })}
                {waitingLane.workflows.length === 0 && waitingLane.tasks.length === 0 && (
                  <p className={`${isDashboardPreset ? 'min-w-[168px]' : 'min-w-[224px]'} rounded border border-dashed border-[#bfcff0] bg-white px-2 py-4 text-center text-xs text-[#64748b]`}>
                    대기 업무 없음
                  </p>
                )}
              </div>
            )}
          </div>

          <div className={stageGridClass}>
            {stageColumns.map((column) => {
              const grouped = Array.from(groupByCategory(column.tasks).entries())
              const flatTasks = column.tasks
              const isCompact = column.compactThreshold > 0 && flatTasks.length > column.compactThreshold
              const Icon = column.icon

              return (
                <div key={column.key} className={`relative z-10 flex h-full min-h-0 flex-col rounded-xl border ${column.borderClass} bg-white ${stageColumnPaddingClass}`}>
                  <div className={`${isDashboardPreset ? 'mb-1.5' : 'mb-2'} flex shrink-0 items-center justify-between`}>
                    <div className="flex items-center gap-1.5">
                      <Icon size={14} className={column.colorClass} />
                      <div className={`flex items-center ${isDashboardPreset ? 'gap-1' : 'gap-1.5'}`}>
                        <p className={`${isDashboardPreset ? 'text-[12px]' : 'text-sm'} font-semibold ${column.colorClass}`}>{column.label}</p>
                        {column.subLabel && <p className={`${isDashboardPreset ? 'text-[11px]' : 'text-[10px]'} text-[#64748b]`}>{column.subLabel}</p>}
                      </div>
                    </div>
                    <span className="rounded-full bg-[#f5f9ff] px-2 py-0.5 text-[11px] font-semibold text-[#1a3660]">
                      {column.tasks.length + column.workflows.length}건
                    </span>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                    {column.workflows.map((workflow) => {
                      const accent = getAccent(workflow.fund_name || workflow.gp_entity_name || workflow.name)
                      const { percent } = parseProgress(workflow.progress)
                      const cardKey = `wf-${workflow.id}`
                      const chain = getCardChainMeta(cardKey, workflow.next_step || null)

                      return (
                        <button
                          key={cardKey}
                          {...cardInteraction(cardKey)}
                          onClick={() => onClickWorkflow(workflow)}
                          className={`w-full shrink-0 rounded-lg border border-[#d8e5fb] border-l-4 bg-white px-2 py-2 text-left transition-colors hover:border-[#b2cbfb] ${accent.border} ${chain.ringClass}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold leading-tight text-[#0f1f3d]">워크플로우: {workflow.name}</p>
                              <p className="mt-0.5 truncate text-[11px] leading-tight text-[#0f1f3d]">현재 단계: {workflow.next_step || '다음 단계 확인'}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {chain.badge && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${chain.badge.className}`}>{chain.badge.label}</span>}
                              <span className={`text-[11px] ${accent.text}`}>{workflow.progress}</span>
                            </div>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#d8e5fb]">
                            <div className="h-full rounded-full bg-[#558ef8] transition-all duration-300" style={{ width: `${percent}%` }} />
                          </div>
                          <p className={`mt-1 truncate text-[11px] ${accent.text}`}>
                            {workflow.fund_name || workflow.gp_entity_name || '-'}
                            {workflow.next_step_date ? ` · ${formatShortDate(workflow.next_step_date)}` : ''}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-[#1a3660]">다음: {chain.nextLabel || '다음 단계 미정'}</p>
                        </button>
                      )
                    })}

                    {!column.workflows.length && !grouped.length && (
                      <p className="rounded border border-dashed border-[#d8e5fb] bg-white px-2 py-5 text-center text-xs text-[#64748b]">업무 없음</p>
                    )}

                    {isCompact ? (
                      <div className="space-y-1.5">
                        {flatTasks.map((task) => {
                          const cardKey = `task-${task.id}`
                          const deadlineBorder = taskDeadlineBorderClass(task, todayIso, weekEndIso)
                          const chain = getCardChainMeta(cardKey)

                          return (
                            <button
                              key={cardKey}
                              {...cardInteraction(cardKey)}
                              onClick={() => onClickTask(task, { editable: column.editable })}
                              className={`group relative w-full shrink-0 rounded-lg border border-[#d8e5fb] border-l-4 bg-white px-2 py-1.5 text-left transition-colors hover:border-[#bfcff0] ${deadlineBorder} ${chain.ringClass}`}
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <p className="truncate text-[12px] font-medium leading-tight text-[#0f1f3d]">{task.title}</p>
                                {chain.badge && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${chain.badge.className}`}>{chain.badge.label}</span>}
                              </div>
                              {chain.nextLabel && <p className="mt-1 truncate text-[11px] text-[#1a3660]">다음: {chain.nextLabel}</p>}
                              <div className="pointer-events-none invisible absolute left-full top-0 z-20 ml-2 w-52 rounded border border-[#d8e5fb] bg-white p-2 text-[11px] text-[#64748b] shadow-lg group-hover:visible">
                                <p className="font-medium text-[#0f1f3d]">{task.title}</p>
                                <p className="mt-1">마감: {task.deadline ? formatShortDate(task.deadline) : '기한 없음'}</p>
                                <p>예상: {task.estimated_time || '-'}</p>
                                <p>대상: {task.fund_name || task.gp_entity_name || '일반'}</p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      grouped.map(([category, tasks]) => (
                        <div key={`${column.key}-${category}`}>
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryBadgeClass(category)}`}>{category}</span>
                            <span className="text-[10px] text-[#64748b]">{tasks.length}</span>
                          </div>
                          <div className="space-y-1.5">
                            {tasks.map((task) => {
                              const accent = getAccent(task.fund_name || task.gp_entity_name || task.title)
                              const cardKey = `task-${task.id}`
                              const deadlineBorder = taskDeadlineBorderClass(task, todayIso, weekEndIso)
                              const chain = getCardChainMeta(cardKey)

                              return (
                                <button
                                  key={cardKey}
                                  {...cardInteraction(cardKey)}
                                  onClick={() => onClickTask(task, { editable: column.editable })}
                                  className={`w-full shrink-0 rounded-lg border border-[#d8e5fb] border-l-4 bg-white px-2 py-2 text-left transition-colors hover:border-[#bfcff0] ${deadlineBorder} ${chain.ringClass}`}
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <p className="truncate text-[12px] font-medium leading-tight text-[#0f1f3d]">{task.title}</p>
                                    {chain.badge && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${chain.badge.className}`}>{chain.badge.label}</span>}
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#64748b]">
                                    <span className={`truncate ${accent.text}`}>{task.fund_name || task.gp_entity_name || '일반'}</span>
                                    <span className="shrink-0">{task.deadline ? formatShortDate(task.deadline) : '기한 없음'}</span>
                                  </div>
                                  {chain.nextLabel && <p className="mt-1 truncate text-[11px] text-[#1a3660]">다음: {chain.nextLabel}</p>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 px-2 text-[11px] text-[#64748b]">
        {isDashboardPreset ? (
          <>
            <span className="inline-flex items-center gap-1">
              <i className="h-[3px] w-6 bg-[#0f1f3d]" />
              주경로 (오늘→다음)
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-[2px] w-5 border-t-2 border-dashed border-[#64748b]" />
              보조연결
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1">
              <i className="h-[3px] w-6 bg-[#0f1f3d]" />
              주경로 (오늘→다음)
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-[2px] w-5 bg-[#558ef8]" />
              워크플로 연계
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-[2px] w-5 border-t-2 border-dashed border-[#64748b]" />
              보조연결 (투자/조합/고유계정)
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-[2px] w-5 border-t-2 border-dashed border-pink-600" />
              통지/보고
            </span>
          </>
        )}
      </div>
    </div>
  )
}


