export const LP_TYPE_INSTITUTIONAL = '유한책임조합원(기관투자자)'
export const LP_TYPE_INDIVIDUAL = '유한책임조합원(개인투자자)'
export const LP_TYPE_GP = '업무집행조합원(GP)'
export const LP_TYPE_SPECIAL_MOTAE = '특별조합원(모태)'
export const LP_TYPE_SPECIAL_NONG_MOTAE = '특별조합원(농모태)'
export const LP_TYPE_SPECIAL_GROWTH = '특별조합원(성장금융)'
export const LP_TYPE_SPECIAL_OTHER_POLICY = '특별조합원(기타정책자금)'

export const LP_TYPE_OPTIONS = [
  LP_TYPE_INSTITUTIONAL,
  LP_TYPE_INDIVIDUAL,
  LP_TYPE_GP,
  LP_TYPE_SPECIAL_MOTAE,
  LP_TYPE_SPECIAL_NONG_MOTAE,
  LP_TYPE_SPECIAL_GROWTH,
  LP_TYPE_SPECIAL_OTHER_POLICY,
] as const

export type LpTypeValue = (typeof LP_TYPE_OPTIONS)[number]

export const DEFAULT_LP_TYPE: LpTypeValue = LP_TYPE_INSTITUTIONAL

export const LP_TYPE_SELECT_GROUPS: Array<{ label: string; options: ReadonlyArray<LpTypeValue> }> = [
  { label: '유한책임조합원', options: [LP_TYPE_INSTITUTIONAL, LP_TYPE_INDIVIDUAL] },
  { label: '업무집행조합원', options: [LP_TYPE_GP] },
  { label: '특별조합원', options: [LP_TYPE_SPECIAL_MOTAE, LP_TYPE_SPECIAL_NONG_MOTAE, LP_TYPE_SPECIAL_GROWTH, LP_TYPE_SPECIAL_OTHER_POLICY] },
]

const LP_TYPE_SET = new Set<string>(LP_TYPE_OPTIONS)

function normalizeKey(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/[\s\-_()/]+/g, '')
}

const LP_TYPE_ALIASES = new Map<string, LpTypeValue>([
  [normalizeKey(LP_TYPE_INSTITUTIONAL), LP_TYPE_INSTITUTIONAL],
  [normalizeKey('institutional'), LP_TYPE_INSTITUTIONAL],
  [normalizeKey('기관투자자'), LP_TYPE_INSTITUTIONAL],
  [normalizeKey('기관'), LP_TYPE_INSTITUTIONAL],
  [normalizeKey('법인'), LP_TYPE_INSTITUTIONAL],
  [normalizeKey('corporate'), LP_TYPE_INSTITUTIONAL],
  [normalizeKey(LP_TYPE_INDIVIDUAL), LP_TYPE_INDIVIDUAL],
  [normalizeKey('individual'), LP_TYPE_INDIVIDUAL],
  [normalizeKey('개인투자자'), LP_TYPE_INDIVIDUAL],
  [normalizeKey('개인'), LP_TYPE_INDIVIDUAL],
  [normalizeKey(LP_TYPE_GP), LP_TYPE_GP],
  [normalizeKey('gp'), LP_TYPE_GP],
  [normalizeKey('업무집행조합원'), LP_TYPE_GP],
  [normalizeKey('공동업무집행'), LP_TYPE_GP],
  [normalizeKey('co-gp'), LP_TYPE_GP],
  [normalizeKey('cogp'), LP_TYPE_GP],
  [normalizeKey(LP_TYPE_SPECIAL_MOTAE), LP_TYPE_SPECIAL_MOTAE],
  [normalizeKey('모태'), LP_TYPE_SPECIAL_MOTAE],
  [normalizeKey('motae'), LP_TYPE_SPECIAL_MOTAE],
  [normalizeKey(LP_TYPE_SPECIAL_NONG_MOTAE), LP_TYPE_SPECIAL_NONG_MOTAE],
  [normalizeKey('농모태'), LP_TYPE_SPECIAL_NONG_MOTAE],
  [normalizeKey('nong-motae'), LP_TYPE_SPECIAL_NONG_MOTAE],
  [normalizeKey('nongmotae'), LP_TYPE_SPECIAL_NONG_MOTAE],
  [normalizeKey(LP_TYPE_SPECIAL_GROWTH), LP_TYPE_SPECIAL_GROWTH],
  [normalizeKey('성장금융'), LP_TYPE_SPECIAL_GROWTH],
  [normalizeKey('growth-finance'), LP_TYPE_SPECIAL_GROWTH],
  [normalizeKey('growthfinance'), LP_TYPE_SPECIAL_GROWTH],
  [normalizeKey(LP_TYPE_SPECIAL_OTHER_POLICY), LP_TYPE_SPECIAL_OTHER_POLICY],
  [normalizeKey('특별조합원'), LP_TYPE_SPECIAL_OTHER_POLICY],
  [normalizeKey('정책출자자'), LP_TYPE_SPECIAL_OTHER_POLICY],
  [normalizeKey('정책자금'), LP_TYPE_SPECIAL_OTHER_POLICY],
  [normalizeKey('기타정책자금'), LP_TYPE_SPECIAL_OTHER_POLICY],
  [normalizeKey('정부기관'), LP_TYPE_SPECIAL_OTHER_POLICY],
  [normalizeKey('government'), LP_TYPE_SPECIAL_OTHER_POLICY],
])

export function normalizeLpType(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim()
  if (!trimmed) return null
  return LP_TYPE_ALIASES.get(normalizeKey(trimmed)) ?? trimmed
}

export function normalizeLpTypeOrFallback(
  value: string | null | undefined,
  fallback: string = DEFAULT_LP_TYPE,
): string {
  return normalizeLpType(value) ?? fallback
}

export function labelLpType(value: string | null | undefined): string {
  const normalized = normalizeLpType(value)
  return normalized || '-'
}

export function groupLpType(value: string | null | undefined): string {
  const normalized = normalizeLpType(value)
  if (!normalized) return '-'
  if (normalized === LP_TYPE_INSTITUTIONAL || normalized === LP_TYPE_INDIVIDUAL) return '유한책임조합원'
  if (normalized === LP_TYPE_GP) return '업무집행조합원'
  if (
    normalized === LP_TYPE_SPECIAL_MOTAE ||
    normalized === LP_TYPE_SPECIAL_NONG_MOTAE ||
    normalized === LP_TYPE_SPECIAL_GROWTH ||
    normalized === LP_TYPE_SPECIAL_OTHER_POLICY
  ) {
    return '특별조합원'
  }
  return normalized
}

export function isGpLpType(value: string | null | undefined): boolean {
  return normalizeLpType(value) === LP_TYPE_GP
}

export function isKnownLpType(value: string | null | undefined): boolean {
  const normalized = normalizeLpType(value)
  return normalized != null && LP_TYPE_SET.has(normalized)
}
