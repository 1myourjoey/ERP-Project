import { api } from './client'

export type AnalyticsFieldKind = 'dimension' | 'measure'
export type AnalyticsDataType = 'string' | 'number' | 'boolean' | 'date' | 'datetime'
export type AnalyticsMode = 'pivot' | 'table'
export type AnalyticsAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count'

export interface AnalyticsFieldMeta {
  key: string
  label: string
  kind: AnalyticsFieldKind
  data_type: AnalyticsDataType
  group: string
  description?: string | null
  operators: string[]
  allowed_aggregates: AnalyticsAggregate[]
  default_aggregate?: AnalyticsAggregate | null
  is_linked_measure: boolean
}

export interface AnalyticsSubjectMeta {
  key: string
  label: string
  description: string
  grain_label: string
  fields: AnalyticsFieldMeta[]
  default_table_fields: string[]
  default_values: AnalyticsValueSpec[]
}

export interface AnalyticsStarterView {
  key: string
  label: string
  description: string
  subject_key: string
  config: AnalyticsQueryRequest
}

export interface AnalyticsExecutiveFilterBinding {
  fund_field?: string | null
  date_field?: string | null
}

export type AnalyticsExecutiveVisualType =
  | 'kpi'
  | 'line'
  | 'stacked_area'
  | 'bar'
  | 'grouped_bar'
  | 'stacked_bar'
  | 'donut'
  | 'ranked_bar'
  | 'table'

export interface AnalyticsExecutiveCard {
  key: string
  title: string
  description: string
  subject_key: string
  visual_type: AnalyticsExecutiveVisualType
  height: 'sm' | 'md' | 'lg'
  query: AnalyticsQueryRequest
  filter_binding: AnalyticsExecutiveFilterBinding
  direct_analysis_label: string
}

export interface AnalyticsExecutiveSection {
  key: string
  label: string
  layout: 'kpi' | 'grid'
  cards: AnalyticsExecutiveCard[]
}

export interface AnalyticsExecutivePack {
  key: string
  label: string
  description: string
  sections: AnalyticsExecutiveSection[]
}

export interface AnalyticsOptionItem {
  value: string
  label: string
}

export interface AnalyticsExecutiveFilterOptions {
  funds: AnalyticsOptionItem[]
}

export interface AnalyticsCatalogResponse {
  subjects: AnalyticsSubjectMeta[]
  starter_views: AnalyticsStarterView[]
  executive_packs: AnalyticsExecutivePack[]
  executive_filter_options: AnalyticsExecutiveFilterOptions
}

export interface AnalyticsFilter {
  field: string
  op: string
  value?: unknown
  value_to?: unknown
}

export interface AnalyticsSort {
  field: string
  direction: 'asc' | 'desc'
}

export interface AnalyticsValueSpec {
  key: string
  aggregate?: AnalyticsAggregate | null
  alias?: string | null
}

export interface AnalyticsQueryOptions {
  show_subtotals: boolean
  show_grand_totals: boolean
  hide_empty: boolean
  hide_zero: boolean
  row_limit: number
  column_limit: number
}

export interface AnalyticsQueryRequest {
  subject_key: string
  mode: AnalyticsMode
  rows: string[]
  columns: string[]
  values: AnalyticsValueSpec[]
  selected_fields: string[]
  filters: AnalyticsFilter[]
  sorts: AnalyticsSort[]
  options: AnalyticsQueryOptions
}

export interface AnalyticsResultField {
  key: string
  label: string
  kind: AnalyticsFieldKind
  data_type: AnalyticsDataType
}

export interface AnalyticsQueryMeta {
  subject_key: string
  subject_label: string
  mode: AnalyticsMode
  grain_label: string
  execution_ms: number
  truncated: boolean
  warnings: string[]
  result_count: number
}

export interface AnalyticsQueryResponse {
  meta: AnalyticsQueryMeta
  row_fields: AnalyticsResultField[]
  column_fields: AnalyticsResultField[]
  value_fields: AnalyticsResultField[]
  table_fields: AnalyticsResultField[]
  rows: Record<string, unknown>[]
  grand_totals: Record<string, unknown>
}

export interface AnalyticsSavedView {
  id: number
  owner_user_id: number
  name: string
  description?: string | null
  subject_key: string
  config: AnalyticsQueryRequest
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export interface AnalyticsBatchQueryItem {
  key: string
  query: AnalyticsQueryRequest
}

export interface AnalyticsBatchQueryRequest {
  items: AnalyticsBatchQueryItem[]
}

export interface AnalyticsBatchQueryResult {
  key: string
  response?: AnalyticsQueryResponse | null
  error?: string | null
}

export interface AnalyticsBatchQueryResponse {
  results: AnalyticsBatchQueryResult[]
}

export interface AnalyticsSavedViewCreate {
  name: string
  description?: string | null
  subject_key: string
  config: AnalyticsQueryRequest
  is_favorite?: boolean
}

export interface AnalyticsSavedViewUpdate {
  name?: string
  description?: string | null
  subject_key?: string
  config?: AnalyticsQueryRequest
  is_favorite?: boolean
}

export interface AnalyticsExportRequest {
  view_id?: number | null
  query?: AnalyticsQueryRequest | null
  file_name?: string | null
}

export async function fetchAnalyticsCatalog() {
  const { data } = await api.get<AnalyticsCatalogResponse>('/analytics/catalog')
  return data
}

export async function runAnalyticsQuery(payload: AnalyticsQueryRequest) {
  const { data } = await api.post<AnalyticsQueryResponse>('/analytics/query', payload)
  return data
}

export async function runAnalyticsBatchQuery(payload: AnalyticsBatchQueryRequest) {
  const { data } = await api.post<AnalyticsBatchQueryResponse>('/analytics/query-batch', payload)
  return data
}

export async function fetchAnalyticsViews() {
  const { data } = await api.get<AnalyticsSavedView[]>('/analytics/views')
  return data
}

export async function fetchAnalyticsView(id: number) {
  const { data } = await api.get<AnalyticsSavedView>(`/analytics/views/${id}`)
  return data
}

export async function createAnalyticsView(payload: AnalyticsSavedViewCreate) {
  const { data } = await api.post<AnalyticsSavedView>('/analytics/views', payload)
  return data
}

export async function updateAnalyticsView(id: number, payload: AnalyticsSavedViewUpdate) {
  const { data } = await api.put<AnalyticsSavedView>(`/analytics/views/${id}`, payload)
  return data
}

export async function deleteAnalyticsView(id: number) {
  const { data } = await api.delete<{ ok: boolean }>(`/analytics/views/${id}`)
  return data
}

export async function exportAnalyticsXlsx(payload: AnalyticsExportRequest) {
  const response = await api.post<Blob>('/analytics/export/xlsx', payload, { responseType: 'blob' })
  return response.data
}
