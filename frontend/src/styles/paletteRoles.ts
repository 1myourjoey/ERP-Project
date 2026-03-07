import {
  BASE_COLOR,
  DEFAULT_RECOMMENDED_PALETTE_ID,
  getPalette,
  type PaletteId,
} from './paletteLibrary'

export interface PaletteRoleMap {
  primaryNav: string
  primaryAccent: string
  surfaceBase: string
  surfaceSoft: string
  textPrimary: string
  textSecondary: string
  warning: string
  danger: string
  highlight: string
}

const FALLBACK_ACCENT = '#558ef8'
const FALLBACK_SURFACE_BASE = '#f5f9ff'
const FALLBACK_SURFACE_SOFT = '#f5f9ff'
const FALLBACK_TEXT_SECONDARY = '#64748b'
const FALLBACK_WARNING = '#b68a00'
const FALLBACK_DANGER = '#6d3e44'
const FALLBACK_HIGHLIGHT = '#f5f9ff'

const DISCREET_ROLE_MAP: PaletteRoleMap = {
  primaryNav: '#0f1f3d',
  primaryAccent: '#558ef8',
  surfaceBase: '#f5f9ff',
  surfaceSoft: '#f5f9ff',
  textPrimary: '#0f1f3d',
  textSecondary: '#64748b',
  warning: '#b68a00',
  danger: '#6d3e44',
  highlight: '#f5f9ff',
}

const SURFACE_BASE_PRIORITY = [2, 3, 4, 5, 1, 0] as const
const SURFACE_SOFT_PRIORITY = [3, 4, 2, 5, 1, 0] as const
const HIGHLIGHT_PRIORITY = [3, 2, 4, 5, 1, 0] as const

const ROLE_OVERRIDES: Partial<Record<PaletteId, Partial<PaletteRoleMap>>> = {
  'discreet-palette': DISCREET_ROLE_MAP,
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.trim().toLowerCase()
  const match = /^#([0-9a-f]{6})$/i.exec(normalized)
  if (!match) return null
  const value = match[1]
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return [r, g, b]
}

function toLinear(channel: number): number {
  const c = channel / 255
  if (c <= 0.03928) return c / 12.92
  return ((c + 0.055) / 1.055) ** 2.4
}

function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function pickLightByPriority(
  colors: readonly string[],
  priorities: readonly number[],
  fallback: string,
  minLuminance: number,
): string {
  for (const index of priorities) {
    const candidate = colors[index]
    if (!candidate) continue
    if (getRelativeLuminance(candidate) >= minLuminance) return candidate
  }
  return fallback
}

function buildDefaultRoleMap(id: PaletteId): PaletteRoleMap {
  const palette = getPalette(id)
  const colors = palette.colors
  const primaryNav = colors[0] ?? BASE_COLOR
  const primaryAccent = colors[1] ?? FALLBACK_ACCENT

  const surfaceBase = pickLightByPriority(
    colors,
    SURFACE_BASE_PRIORITY,
    FALLBACK_SURFACE_BASE,
    0.72,
  )
  const surfaceSoft = pickLightByPriority(
    colors,
    SURFACE_SOFT_PRIORITY,
    FALLBACK_SURFACE_SOFT,
    0.65,
  )
  const highlight = pickLightByPriority(colors, HIGHLIGHT_PRIORITY, FALLBACK_HIGHLIGHT, 0.62)

  return {
    primaryNav,
    primaryAccent,
    surfaceBase,
    surfaceSoft,
    textPrimary: primaryNav,
    textSecondary: FALLBACK_TEXT_SECONDARY,
    warning: FALLBACK_WARNING,
    danger: FALLBACK_DANGER,
    highlight,
  }
}

export function getRoleMapForPalette(
  id: PaletteId = DEFAULT_RECOMMENDED_PALETTE_ID,
): PaletteRoleMap {
  const baseMap = buildDefaultRoleMap(id)
  const override = ROLE_OVERRIDES[id]
  if (!override) return baseMap
  return { ...baseMap, ...override }
}
