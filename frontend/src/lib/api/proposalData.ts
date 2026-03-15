import { api } from './client'

export type ProposalTemplateType =
  | 'growth-finance'
  | 'motae-5'
  | 'motae-6'
  | 'motae-7'
  | 'nong-motae'

export interface ProposalWorkspaceGPEntity {
  id: number
  name: string
  entity_type: string
  business_number: string | null
  registration_number: string | null
  representative: string | null
  address: string | null
  phone: string | null
  email: string | null
  founding_date: string | null
  license_date: string | null
  capital: number | null
  total_employees: number | null
  fund_manager_count: number | null
  paid_in_capital: number | null
  notes: string | null
  is_primary: number
}

export interface ProposalWorkspaceFund {
  id: number
  name: string
  type: string
  status: string
  gp_entity_id: number | null
  gp: string | null
  fund_manager: string | null
  formation_date: string | null
  investment_period_end: string | null
  maturity_date: string | null
  commitment_total: number | null
  paid_in_total: number
  invested_total: number
  exit_total: number
  nav_total: number
}

export interface ProposalWorkspaceMetric {
  label: string
  value: string
  hint?: string | null
}

export interface ProposalWorkspaceSummary {
  selected_fund_count: number
  selected_manager_count: number
  total_commitment: number
  total_paid_in: number
  total_invested: number
  total_exit_amount: number
}

export interface GPFinancial {
  id: number
  gp_entity_id: number
  fiscal_year_end: string
  total_assets: number | null
  current_assets: number | null
  total_liabilities: number | null
  current_liabilities: number | null
  total_equity: number | null
  paid_in_capital: number | null
  revenue: number | null
  operating_income: number | null
  net_income: number | null
  created_at: string
  updated_at: string
}

export interface GPFinancialInput {
  gp_entity_id: number
  fiscal_year_end: string
  total_assets: number | null
  current_assets: number | null
  total_liabilities: number | null
  current_liabilities: number | null
  total_equity: number | null
  paid_in_capital: number | null
  revenue: number | null
  operating_income: number | null
  net_income: number | null
}

export interface GPShareholder {
  id: number
  gp_entity_id: number
  snapshot_date: string
  name: string
  shares: number | null
  acquisition_amount: number | null
  ownership_pct: number | null
  is_largest: boolean
  relationship: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

export interface GPShareholderInput {
  gp_entity_id: number
  snapshot_date: string
  name: string
  shares: number | null
  acquisition_amount: number | null
  ownership_pct: number | null
  is_largest: boolean
  relationship: string | null
  memo: string | null
}

export interface ProposalFundManager {
  id: number
  gp_entity_id: number | null
  name: string
  birth_date: string | null
  nationality: string | null
  phone: string | null
  fax: string | null
  email: string | null
  department: string | null
  position: string | null
  join_date: string | null
  resign_date: string | null
  is_core: boolean
  is_representative: boolean
  created_at: string
  updated_at: string
}

export interface ProposalFundManagerInput {
  gp_entity_id: number | null
  name: string
  birth_date: string | null
  nationality: string | null
  phone: string | null
  fax: string | null
  email: string | null
  department: string | null
  position: string | null
  join_date: string | null
  resign_date: string | null
  is_core: boolean
  is_representative: boolean
}

export interface ManagerCareer {
  id: number
  fund_manager_id: number
  company_name: string
  company_type: string | null
  department: string | null
  position: string | null
  start_date: string | null
  end_date: string | null
  main_task: string | null
  is_investment_exp: boolean
  employment_type: string | null
  created_at: string
  updated_at: string
}

export interface ManagerCareerInput {
  fund_manager_id: number
  company_name: string
  company_type: string | null
  department: string | null
  position: string | null
  start_date: string | null
  end_date: string | null
  main_task: string | null
  is_investment_exp: boolean
  employment_type: string | null
}

export interface ManagerEducation {
  id: number
  fund_manager_id: number
  school_name: string
  major: string | null
  degree: string | null
  admission_date: string | null
  graduation_date: string | null
  country: string | null
  created_at: string
  updated_at: string
}

export interface ManagerEducationInput {
  fund_manager_id: number
  school_name: string
  major: string | null
  degree: string | null
  admission_date: string | null
  graduation_date: string | null
  country: string | null
}

export interface ManagerAward {
  id: number
  fund_manager_id: number
  award_date: string | null
  award_name: string
  organization: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

export interface ManagerAwardInput {
  fund_manager_id: number
  award_date: string | null
  award_name: string
  organization: string | null
  memo: string | null
}

export interface ManagerInvestment {
  id: number
  fund_manager_id: number
  investment_id: number | null
  fund_id: number | null
  source_company_name: string | null
  fund_name: string | null
  company_name: string | null
  investment_date: string | null
  instrument: string | null
  amount: number | null
  exit_date: string | null
  exit_amount: number | null
  role: string | null
  discovery_contrib: number | null
  review_contrib: number | null
  contrib_rate: number | null
  is_current_company: boolean
  created_at: string
  updated_at: string
}

export interface ManagerInvestmentInput {
  fund_manager_id: number
  investment_id: number | null
  fund_id: number | null
  source_company_name: string | null
  fund_name: string | null
  company_name: string | null
  investment_date: string | null
  instrument: string | null
  amount: number | null
  exit_date: string | null
  exit_amount: number | null
  role: string | null
  discovery_contrib: number | null
  review_contrib: number | null
  contrib_rate: number | null
  is_current_company: boolean
}

export interface FundManagerHistory {
  id: number
  fund_id: number
  fund_manager_id: number
  change_date: string
  change_type: string
  role_before: string | null
  role_after: string | null
  memo: string | null
  created_at: string
}

export interface FundManagerHistoryInput {
  fund_id: number
  fund_manager_id: number
  change_date: string
  change_type: string
  role_before: string | null
  role_after: string | null
  memo: string | null
}

export interface FundSubscription {
  id: number
  fund_id: number
  subscription_type: string
  subscription_date: string
  result: string | null
  target_irr: number | null
  target_commitment: number | null
  actual_commitment: number | null
  memo: string | null
  created_at: string
  updated_at: string
}

export interface FundSubscriptionInput {
  fund_id: number
  subscription_type: string
  subscription_date: string
  result: string | null
  target_irr: number | null
  target_commitment: number | null
  actual_commitment: number | null
  memo: string | null
}

export interface ProposalReadiness {
  as_of_date: string
  template_type: ProposalTemplateType
  is_ready: boolean
  missing_items: string[]
  warnings: string[]
}

export interface ProposalVersion {
  id: number
  template_type: ProposalTemplateType
  gp_entity_id: number | null
  fund_ids: number[]
  as_of_date: string
  status: string
  render_snapshot_json: string | null
  generated_filename: string | null
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface ProposalWorkspaceResponse {
  template_type: ProposalTemplateType
  as_of_date: string
  gp_entities: ProposalWorkspaceGPEntity[]
  available_funds: ProposalWorkspaceFund[]
  funds: ProposalWorkspaceFund[]
  selected_gp_entity: ProposalWorkspaceGPEntity | null
  selected_fund_ids: number[]
  summary: ProposalWorkspaceSummary
  metrics: ProposalWorkspaceMetric[]
  gp_financials: GPFinancial[]
  gp_shareholders: GPShareholder[]
  fund_managers: ProposalFundManager[]
  manager_careers: ManagerCareer[]
  manager_educations: ManagerEducation[]
  manager_awards: ManagerAward[]
  manager_investments: ManagerInvestment[]
  fund_manager_histories: FundManagerHistory[]
  fund_subscriptions: FundSubscription[]
  readiness: ProposalReadiness
  version: ProposalVersion | null
  render_snapshot: Record<string, unknown> | null
}

export interface ProposalWorkspaceParams {
  template_type: ProposalTemplateType
  as_of_date: string
  gp_entity_id?: number | null
  fund_ids?: number[]
  version_id?: number | null
}

export interface ProposalVersionCreateInput {
  template_type: ProposalTemplateType
  gp_entity_id: number | null
  fund_ids: number[]
  as_of_date: string
}

export interface ProposalExportInput extends ProposalVersionCreateInput {
  version_id?: number | null
}

export interface ProposalGPEntityUpdateInput {
  name?: string | null
  entity_type?: string | null
  business_number?: string | null
  registration_number?: string | null
  representative?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  founding_date?: string | null
  license_date?: string | null
  capital?: number | null
  total_employees?: number | null
  fund_manager_count?: number | null
  paid_in_capital?: number | null
  notes?: string | null
}

export async function fetchProposalWorkspace(params: ProposalWorkspaceParams) {
  const { data } = await api.get<ProposalWorkspaceResponse>('/proposal-data/workspace', {
    params: {
      template_type: params.template_type,
      as_of_date: params.as_of_date,
      gp_entity_id: params.gp_entity_id ?? undefined,
      fund_ids: params.fund_ids?.join(',') || undefined,
      version_id: params.version_id ?? undefined,
    },
  })
  return data
}

export async function fetchProposalReadiness(params: ProposalWorkspaceParams) {
  const { data } = await api.get<ProposalReadiness>('/proposal-data/readiness', {
    params: {
      template_type: params.template_type,
      as_of_date: params.as_of_date,
      gp_entity_id: params.gp_entity_id ?? undefined,
      fund_ids: params.fund_ids?.join(',') || undefined,
    },
  })
  return data
}

export async function updateProposalGPEntity(entityId: number, payload: ProposalGPEntityUpdateInput) {
  const { data } = await api.patch<ProposalWorkspaceGPEntity>(`/gp-entities/${entityId}`, payload)
  return data
}

export async function createGPFinancial(payload: GPFinancialInput) {
  const { data } = await api.post<GPFinancial>('/proposal-data/gp-financials', payload)
  return data
}

export async function updateGPFinancial(id: number, payload: Partial<GPFinancialInput>) {
  const { data } = await api.patch<GPFinancial>(`/proposal-data/gp-financials/${id}`, payload)
  return data
}

export async function deleteGPFinancial(id: number) {
  await api.delete(`/proposal-data/gp-financials/${id}`)
}

export async function createGPShareholder(payload: GPShareholderInput) {
  const { data } = await api.post<GPShareholder>('/proposal-data/gp-shareholders', payload)
  return data
}

export async function updateGPShareholder(id: number, payload: Partial<GPShareholderInput>) {
  const { data } = await api.patch<GPShareholder>(`/proposal-data/gp-shareholders/${id}`, payload)
  return data
}

export async function deleteGPShareholder(id: number) {
  await api.delete(`/proposal-data/gp-shareholders/${id}`)
}

export async function createProposalFundManager(payload: ProposalFundManagerInput) {
  const { data } = await api.post<ProposalFundManager>('/proposal-data/fund-managers', payload)
  return data
}

export async function updateProposalFundManager(id: number, payload: Partial<ProposalFundManagerInput>) {
  const { data } = await api.patch<ProposalFundManager>(`/proposal-data/fund-managers/${id}`, payload)
  return data
}

export async function deleteProposalFundManager(id: number) {
  await api.delete(`/proposal-data/fund-managers/${id}`)
}

export async function createManagerCareer(payload: ManagerCareerInput) {
  const { data } = await api.post<ManagerCareer>('/proposal-data/manager-careers', payload)
  return data
}

export async function updateManagerCareer(id: number, payload: Partial<ManagerCareerInput>) {
  const { data } = await api.patch<ManagerCareer>(`/proposal-data/manager-careers/${id}`, payload)
  return data
}

export async function deleteManagerCareer(id: number) {
  await api.delete(`/proposal-data/manager-careers/${id}`)
}

export async function createManagerEducation(payload: ManagerEducationInput) {
  const { data } = await api.post<ManagerEducation>('/proposal-data/manager-educations', payload)
  return data
}

export async function updateManagerEducation(id: number, payload: Partial<ManagerEducationInput>) {
  const { data } = await api.patch<ManagerEducation>(`/proposal-data/manager-educations/${id}`, payload)
  return data
}

export async function deleteManagerEducation(id: number) {
  await api.delete(`/proposal-data/manager-educations/${id}`)
}

export async function createManagerAward(payload: ManagerAwardInput) {
  const { data } = await api.post<ManagerAward>('/proposal-data/manager-awards', payload)
  return data
}

export async function updateManagerAward(id: number, payload: Partial<ManagerAwardInput>) {
  const { data } = await api.patch<ManagerAward>(`/proposal-data/manager-awards/${id}`, payload)
  return data
}

export async function deleteManagerAward(id: number) {
  await api.delete(`/proposal-data/manager-awards/${id}`)
}

export async function createManagerInvestment(payload: ManagerInvestmentInput) {
  const { data } = await api.post<ManagerInvestment>('/proposal-data/manager-investments', payload)
  return data
}

export async function updateManagerInvestment(id: number, payload: Partial<ManagerInvestmentInput>) {
  const { data } = await api.patch<ManagerInvestment>(`/proposal-data/manager-investments/${id}`, payload)
  return data
}

export async function deleteManagerInvestment(id: number) {
  await api.delete(`/proposal-data/manager-investments/${id}`)
}

export async function createFundSubscription(payload: FundSubscriptionInput) {
  const { data } = await api.post<FundSubscription>('/proposal-data/fund-subscriptions', payload)
  return data
}

export async function updateFundSubscription(id: number, payload: Partial<FundSubscriptionInput>) {
  const { data } = await api.patch<FundSubscription>(`/proposal-data/fund-subscriptions/${id}`, payload)
  return data
}

export async function deleteFundSubscription(id: number) {
  await api.delete(`/proposal-data/fund-subscriptions/${id}`)
}

export async function createFundManagerHistory(payload: FundManagerHistoryInput) {
  const { data } = await api.post<FundManagerHistory>('/proposal-data/fund-manager-histories', payload)
  return data
}

export async function updateFundManagerHistory(id: number, payload: Partial<FundManagerHistoryInput>) {
  const { data } = await api.patch<FundManagerHistory>(`/proposal-data/fund-manager-histories/${id}`, payload)
  return data
}

export async function deleteFundManagerHistory(id: number) {
  await api.delete(`/proposal-data/fund-manager-histories/${id}`)
}

export async function createProposalVersion(payload: ProposalVersionCreateInput) {
  const { data } = await api.post<ProposalVersion>('/proposal-versions', payload)
  return data
}

export async function freezeProposalVersion(versionId: number) {
  const { data } = await api.post<ProposalVersion>(`/proposal-versions/${versionId}/freeze`)
  return data
}

export async function exportProposalTemplate(payload: ProposalExportInput) {
  const { data } = await api.post(`/proposal-exports/${payload.template_type}`, payload, { responseType: 'blob' })
  return data as Blob
}

export interface ProposalTemplateRegistrySummary {
  id: number
  code: string
  name: string
  institution_type: string | null
  legacy_template_type: string | null
  description: string | null
  output_format: string
  source_family: string
  is_active: boolean
  version_count: number
  active_version_id: number | null
  active_version_label: string | null
  created_at: string
  updated_at: string
}

export interface ProposalTemplateRegistryCreateInput {
  code: string
  name: string
  institution_type?: string | null
  legacy_template_type?: string | null
  description?: string | null
  output_format?: string
  source_family?: string
  is_active?: boolean
}

export interface ProposalTemplateRegistryVersionSummary {
  id: number
  template_id: number
  version_label: string
  status: string
  source_path: string | null
  source_filename: string | null
  effective_from: string | null
  effective_to: string | null
  notes: string | null
  sheet_count: number
  field_mapping_count: number
  table_mapping_count: number
  validation_rule_count: number
  created_at: string
  updated_at: string
}

export interface ProposalTemplateRegistrySheet {
  id: number
  sheet_code: string
  sheet_name: string
  sheet_kind: string
  display_order: number
  is_required: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProposalTemplateRegistryFieldMapping {
  id: number
  sheet_code: string
  field_key: string
  target_cell: string
  value_source: string | null
  transform_rule: string | null
  default_value: unknown
  source_note_hint: string | null
  is_required: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface ProposalTemplateRegistryTableMapping {
  id: number
  sheet_code: string
  table_key: string
  start_cell: string
  row_source: string
  columns: Array<Record<string, unknown>>
  row_key_field: string | null
  append_mode: string
  max_rows: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProposalTemplateRegistryValidationRule {
  id: number
  sheet_code: string | null
  rule_code: string
  rule_type: string
  severity: string
  target_ref: string | null
  rule_payload: Record<string, unknown>
  message: string
  created_at: string
  updated_at: string
}

export interface ProposalTemplateRegistryDetail extends ProposalTemplateRegistrySummary {
  versions: ProposalTemplateRegistryVersionSummary[]
}

export interface ProposalTemplateRegistryVersionDetail extends ProposalTemplateRegistryVersionSummary {
  template_code: string
  template_name: string
  sheets: ProposalTemplateRegistrySheet[]
  field_mappings: ProposalTemplateRegistryFieldMapping[]
  table_mappings: ProposalTemplateRegistryTableMapping[]
  validation_rules: ProposalTemplateRegistryValidationRule[]
}

export interface ProposalTemplateRegistryVersionCreateInput {
  version_label: string
  status?: string
  source_path?: string | null
  effective_from?: string | null
  effective_to?: string | null
  notes?: string | null
  import_workbook_sheets?: boolean
}

export interface ProposalTemplateRegistryVersionCloneInput {
  version_label: string
  status?: string
  source_path?: string | null
  effective_from?: string | null
  effective_to?: string | null
  notes?: string | null
}

export interface ProposalTemplateRegistrySheetInput {
  sheet_code?: string | null
  sheet_name: string
  sheet_kind?: string
  display_order?: number
  is_required?: boolean
  notes?: string | null
}

export interface ProposalTemplateRegistryFieldMappingInput {
  sheet_code: string
  field_key: string
  target_cell: string
  value_source?: string | null
  transform_rule?: string | null
  default_value?: unknown
  source_note_hint?: string | null
  is_required?: boolean
  display_order?: number
}

export interface ProposalTemplateRegistryTableColumnInput {
  field_key: string
  target_column?: string | null
  header_label?: string | null
  value_source?: string | null
  transform_rule?: string | null
}

export interface ProposalTemplateRegistryTableMappingInput {
  sheet_code: string
  table_key: string
  start_cell: string
  row_source: string
  columns?: ProposalTemplateRegistryTableColumnInput[]
  row_key_field?: string | null
  append_mode?: string
  max_rows?: number | null
  notes?: string | null
}

export interface ProposalTemplateRegistryValidationRuleInput {
  sheet_code?: string | null
  rule_code: string
  rule_type: string
  severity?: string
  target_ref?: string | null
  rule_payload?: Record<string, unknown>
  message: string
}

export interface ProposalTemplateRegistryVersionRegistryUpdateInput {
  sheets: ProposalTemplateRegistrySheetInput[]
  field_mappings: ProposalTemplateRegistryFieldMappingInput[]
  table_mappings: ProposalTemplateRegistryTableMappingInput[]
  validation_rules: ProposalTemplateRegistryValidationRuleInput[]
}

export interface ProposalTemplateRegistryVersionDiffItem {
  key: string
  sheet_code: string | null
  change_type: 'added' | 'removed' | 'modified'
  changed_fields: string[]
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export interface ProposalTemplateRegistryVersionDiffResponse {
  base_version_id: number
  base_version_label: string
  target_version_id: number
  target_version_label: string
  sheet_changes: ProposalTemplateRegistryVersionDiffItem[]
  field_mapping_changes: ProposalTemplateRegistryVersionDiffItem[]
  table_mapping_changes: ProposalTemplateRegistryVersionDiffItem[]
  validation_rule_changes: ProposalTemplateRegistryVersionDiffItem[]
  changed_sheet_codes: string[]
}

export async function fetchProposalTemplates() {
  const { data } = await api.get<ProposalTemplateRegistrySummary[]>('/proposal-templates')
  return data
}

export async function createProposalTemplateRegistry(payload: ProposalTemplateRegistryCreateInput) {
  const { data } = await api.post<ProposalTemplateRegistrySummary>('/proposal-templates', payload)
  return data
}

export async function fetchProposalTemplateRegistry(templateId: number) {
  const { data } = await api.get<ProposalTemplateRegistryDetail>(`/proposal-templates/${templateId}`)
  return data
}

export async function createProposalTemplateRegistryVersion(templateId: number, payload: ProposalTemplateRegistryVersionCreateInput) {
  const { data } = await api.post<ProposalTemplateRegistryVersionDetail>(`/proposal-templates/${templateId}/versions`, payload)
  return data
}

export async function fetchProposalTemplateRegistryVersion(versionId: number) {
  const { data } = await api.get<ProposalTemplateRegistryVersionDetail>(`/proposal-template-versions/${versionId}`)
  return data
}

export async function cloneProposalTemplateRegistryVersion(versionId: number, payload: ProposalTemplateRegistryVersionCloneInput) {
  const { data } = await api.post<ProposalTemplateRegistryVersionDetail>(`/proposal-template-versions/${versionId}/clone`, payload)
  return data
}

export async function saveProposalTemplateRegistryVersion(versionId: number, payload: ProposalTemplateRegistryVersionRegistryUpdateInput) {
  const { data } = await api.put<ProposalTemplateRegistryVersionDetail>(`/proposal-template-versions/${versionId}/registry`, payload)
  return data
}

export async function compareProposalTemplateRegistryVersions(baseVersionId: number, targetVersionId: number) {
  const { data } = await api.get<ProposalTemplateRegistryVersionDiffResponse>('/proposal-template-versions/compare', {
    params: {
      base_version_id: baseVersionId,
      target_version_id: targetVersionId,
    },
  })
  return data
}

export async function activateProposalTemplateRegistryVersion(versionId: number) {
  const { data } = await api.post<ProposalTemplateRegistryVersionDetail>(`/proposal-template-versions/${versionId}/activate`)
  return data
}

export interface ProposalApplication {
  id: number
  title: string
  template_type: ProposalTemplateType
  institution_type: string | null
  gp_entity_id: number | null
  gp_entity_name: string | null
  as_of_date: string
  status: string
  submitted_at: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  fund_ids: number[]
  fund_count: number
}

export interface ProposalApplicationDetail extends ProposalApplication {
  readiness: ProposalReadiness
}

export interface ProposalApplicationInput {
  title: string
  template_type: ProposalTemplateType
  institution_type: string | null
  gp_entity_id: number | null
  as_of_date: string
  fund_ids: number[]
}

export interface ProposalSheetColumn {
  key: string
  label: string
}

export interface ProposalSheetDescriptor {
  code: string
  title: string
  kind: 'info' | 'scalar' | 'table'
  description: string | null
  row_count: number
  field_count: number
  has_overrides: boolean
  empty_value_count: number
}

export interface ProposalSheetField {
  key: string
  label: string
  default_value: unknown
  final_value: unknown
  source: string
  is_overridden: boolean
}

export interface ProposalSheetRow {
  row_key: string
  default_cells: Record<string, unknown>
  final_cells: Record<string, unknown>
  source: string
  is_manual: boolean
  is_overridden: boolean
}

export interface ProposalSheetView {
  application_id: number
  sheet_code: string
  title: string
  kind: 'info' | 'scalar' | 'table'
  description: string | null
  columns: ProposalSheetColumn[]
  fields: ProposalSheetField[]
  rows: ProposalSheetRow[]
  copy_text: string
  download_filename: string
  is_frozen: boolean
}

export interface ProposalFieldOverrideInput {
  field_key: string
  value: unknown
  source_note?: string | null
}

export interface ProposalRowOverrideInput {
  row_key: string
  row_mode: 'override' | 'add' | 'hide'
  row_payload: Record<string, unknown>
  source_note?: string | null
}

export async function fetchProposalApplications() {
  const { data } = await api.get<ProposalApplication[]>('/proposal-applications')
  return data
}

export async function createProposalApplication(payload: ProposalApplicationInput) {
  const { data } = await api.post<ProposalApplication>('/proposal-applications', payload)
  return data
}

export async function updateProposalApplication(id: number, payload: Partial<ProposalApplicationInput> & { status?: string | null }) {
  const { data } = await api.patch<ProposalApplication>(`/proposal-applications/${id}`, payload)
  return data
}

export async function fetchProposalApplication(id: number) {
  const { data } = await api.get<ProposalApplicationDetail>(`/proposal-applications/${id}`)
  return data
}

export async function freezeProposalApplication(id: number) {
  const { data } = await api.post<ProposalApplication>(`/proposal-applications/${id}/freeze`)
  return data
}

export async function fetchProposalApplicationSheets(id: number) {
  const { data } = await api.get<ProposalSheetDescriptor[]>(`/proposal-applications/${id}/sheets`)
  return data
}

export async function fetchProposalApplicationSheet(id: number, sheetCode: string) {
  const { data } = await api.get<ProposalSheetView>(`/proposal-applications/${id}/sheets/${sheetCode}`)
  return data
}

export async function saveProposalFieldOverrides(id: number, sheetCode: string, overrides: ProposalFieldOverrideInput[]) {
  const { data } = await api.post<ProposalSheetView>(`/proposal-applications/${id}/field-overrides/bulk`, {
    sheet_code: sheetCode,
    overrides,
  })
  return data
}

export async function saveProposalRowOverrides(id: number, sheetCode: string, overrides: ProposalRowOverrideInput[]) {
  const { data } = await api.post<ProposalSheetView>(`/proposal-applications/${id}/row-overrides/bulk`, {
    sheet_code: sheetCode,
    overrides,
  })
  return data
}

export async function fetchProposalApplicationReadiness(id: number) {
  const { data } = await api.get<ProposalReadiness>(`/proposal-applications/${id}/readiness`)
  return data
}

export interface ProposalApplicationExportParams {
  scope?: 'sheet' | 'all'
  format?: 'csv' | 'xlsx'
  sheet_code?: string | null
}

export async function exportProposalApplicationSheet(id: number, params: ProposalApplicationExportParams) {
  const { data } = await api.get(`/proposal-applications/${id}/export`, {
    params,
    responseType: 'blob',
  })
  return data as Blob
}
