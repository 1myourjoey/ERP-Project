import type {
  AnalyticsFilter,
  AnalyticsMode,
  AnalyticsQueryOptions,
  AnalyticsQueryRequest,
  AnalyticsSort,
  AnalyticsValueSpec,
} from '../api/analytics'

export interface AnalyticsBuilderState extends AnalyticsQueryRequest {
  activeViewId: number | null
  dirty: boolean
}

type ZoneKey = 'rows' | 'columns' | 'selected_fields'

type AnalyticsBuilderAction =
  | { type: 'reset'; payload: AnalyticsBuilderState }
  | { type: 'set-subject'; subjectKey: string }
  | { type: 'set-mode'; mode: AnalyticsMode }
  | { type: 'set-active-view'; viewId: number | null }
  | { type: 'set-dirty'; dirty: boolean }
  | { type: 'add-zone-field'; zone: ZoneKey; field: string }
  | { type: 'insert-zone-field'; zone: ZoneKey; field: string; index: number }
  | { type: 'remove-zone-field'; zone: ZoneKey; field: string }
  | { type: 'move-zone-field'; zone: ZoneKey; from: number; to: number }
  | { type: 'add-value'; value: AnalyticsValueSpec }
  | { type: 'insert-value'; value: AnalyticsValueSpec; index: number }
  | { type: 'move-value'; from: number; to: number }
  | { type: 'update-value'; index: number; value: Partial<AnalyticsValueSpec> }
  | { type: 'remove-value'; index: number }
  | { type: 'add-filter'; filter: AnalyticsFilter }
  | { type: 'update-filter'; index: number; filter: Partial<AnalyticsFilter> }
  | { type: 'remove-filter'; index: number }
  | { type: 'set-filters'; filters: AnalyticsFilter[] }
  | { type: 'set-sorts'; sorts: AnalyticsSort[] }
  | { type: 'set-options'; options: Partial<AnalyticsQueryOptions> }

export const DEFAULT_ANALYTICS_OPTIONS: AnalyticsQueryOptions = {
  show_subtotals: true,
  show_grand_totals: true,
  hide_empty: false,
  hide_zero: false,
  row_limit: 200,
  column_limit: 50,
}

export function buildEmptyAnalyticsState(subjectKey = ''): AnalyticsBuilderState {
  return {
    subject_key: subjectKey,
    mode: 'pivot',
    rows: [],
    columns: [],
    values: [],
    selected_fields: [],
    filters: [],
    sorts: [],
    options: DEFAULT_ANALYTICS_OPTIONS,
    activeViewId: null,
    dirty: false,
  }
}

export function analyticsQueryReducer(state: AnalyticsBuilderState, action: AnalyticsBuilderAction): AnalyticsBuilderState {
  switch (action.type) {
    case 'reset':
      return action.payload
    case 'set-subject':
      return {
        ...buildEmptyAnalyticsState(action.subjectKey),
        mode: state.mode,
        options: state.options,
        dirty: true,
      }
    case 'set-mode':
      return { ...state, mode: action.mode, dirty: true }
    case 'set-active-view':
      return { ...state, activeViewId: action.viewId }
    case 'set-dirty':
      return { ...state, dirty: action.dirty }
    case 'add-zone-field': {
      const next = state[action.zone]
      if (next.includes(action.field)) return state
      return { ...state, [action.zone]: [...next, action.field], dirty: true }
    }
    case 'insert-zone-field': {
      const next = state[action.zone]
      if (next.includes(action.field)) return state
      const inserted = [...next]
      inserted.splice(Math.max(0, Math.min(action.index, inserted.length)), 0, action.field)
      return { ...state, [action.zone]: inserted, dirty: true }
    }
    case 'remove-zone-field':
      return { ...state, [action.zone]: state[action.zone].filter((item) => item !== action.field), dirty: true }
    case 'move-zone-field': {
      const next = [...state[action.zone]]
      const [moved] = next.splice(action.from, 1)
      next.splice(action.to, 0, moved)
      return { ...state, [action.zone]: next, dirty: true }
    }
    case 'add-value':
      if (state.values.some((row) => row.key === action.value.key && (row.aggregate || null) === (action.value.aggregate || null))) return state
      return { ...state, values: [...state.values, action.value], dirty: true }
    case 'insert-value':
      if (state.values.some((row) => row.key === action.value.key && (row.aggregate || null) === (action.value.aggregate || null))) return state
      return {
        ...state,
        values: [
          ...state.values.slice(0, Math.max(0, Math.min(action.index, state.values.length))),
          action.value,
          ...state.values.slice(Math.max(0, Math.min(action.index, state.values.length))),
        ],
        dirty: true,
      }
    case 'move-value': {
      const next = [...state.values]
      const [moved] = next.splice(action.from, 1)
      next.splice(action.to, 0, moved)
      return { ...state, values: next, dirty: true }
    }
    case 'update-value':
      return {
        ...state,
        values: state.values.map((row, index) => (index === action.index ? { ...row, ...action.value } : row)),
        dirty: true,
      }
    case 'remove-value':
      return { ...state, values: state.values.filter((_, index) => index !== action.index), dirty: true }
    case 'add-filter':
      return { ...state, filters: [...state.filters, action.filter], dirty: true }
    case 'update-filter':
      return {
        ...state,
        filters: state.filters.map((row, index) => (index === action.index ? { ...row, ...action.filter } : row)),
        dirty: true,
      }
    case 'remove-filter':
      return { ...state, filters: state.filters.filter((_, index) => index !== action.index), dirty: true }
    case 'set-filters':
      return { ...state, filters: action.filters, dirty: true }
    case 'set-sorts':
      return { ...state, sorts: action.sorts, dirty: true }
    case 'set-options':
      return { ...state, options: { ...state.options, ...action.options }, dirty: true }
    default:
      return state
  }
}

export function stateToQueryRequest(state: AnalyticsBuilderState): AnalyticsQueryRequest {
  return {
    subject_key: state.subject_key,
    mode: state.mode,
    rows: state.rows,
    columns: state.columns,
    values: state.values,
    selected_fields: state.selected_fields,
    filters: state.filters,
    sorts: state.sorts,
    options: state.options,
  }
}
