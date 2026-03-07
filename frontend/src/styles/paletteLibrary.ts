export const BASE_COLOR = '#0f1f3d' as const

export type PaletteCategory = 'gradient' | 'palette' | 'spot' | 'shade'

export const PALETTE_ID_ORDER = [
  'generic-gradient',
  'matching-gradient',
  'spot-palette',
  'twisted-spot-palette',
  'classy-palette',
  'cube-palette',
  'switch-palette',
  'small-switch-palette',
  'skip-gradient',
  'natural-palette',
  'matching-palette',
  'squash-palette',
  'grey-friends',
  'dotting-palette',
  'skip-shade-gradient',
  'threedom',
  'highlight-palette',
  'neighbor-palette',
  'discreet-palette',
  'dust-palette',
  'collective',
  'friend-palette',
  'pin-palette',
  'shades',
  'random-shades',
] as const

export type PaletteId = (typeof PALETTE_ID_ORDER)[number]

export type HexColor = `#${string}`

export interface PalettePreset {
  id: PaletteId
  name: string
  category: PaletteCategory
  colors: readonly [HexColor, ...HexColor[]]
  baseColor: HexColor
  description: string
}

export const DEFAULT_RECOMMENDED_PALETTE_ID: PaletteId = 'discreet-palette'

export const PALETTE_LIBRARY: Record<PaletteId, PalettePreset> = {
  'generic-gradient': {
    id: 'generic-gradient',
    name: 'Generic Gradient',
    category: 'gradient',
    colors: ['#0f1f3d', '#004b6f', '#007b8e', '#00ab8f', '#80d77d', '#f9f871'],
    baseColor: BASE_COLOR,
    description: 'Broad cool-to-warm gradient range.',
  },
  'matching-gradient': {
    id: 'matching-gradient',
    name: 'Matching Gradient',
    category: 'gradient',
    colors: ['#0f1f3d', '#3a395f', '#665481', '#9671a1', '#c98fbf', '#feafdb'],
    baseColor: BASE_COLOR,
    description: 'Soft purple-pink progression for atmospheric sections.',
  },
  'spot-palette': {
    id: 'spot-palette',
    name: 'Spot Palette',
    category: 'spot',
    colors: ['#0f1f3d', '#3f4a6d', '#e7efff', '#d4a418'],
    baseColor: BASE_COLOR,
    description: 'Navy foundation with light neutral and gold spot.',
  },
  'twisted-spot-palette': {
    id: 'twisted-spot-palette',
    name: 'Twisted Spot Palette',
    category: 'spot',
    colors: ['#0f1f3d', '#d4a418', '#ffeeca', '#867555'],
    baseColor: BASE_COLOR,
    description: 'Gold-led variant for premium accents.',
  },
  'classy-palette': {
    id: 'classy-palette',
    name: 'Classy Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#a7aabd', '#737687', '#3b1219', '#6d3e44'],
    baseColor: BASE_COLOR,
    description: 'Muted formal tones for document-heavy views.',
  },
  'cube-palette': {
    id: 'cube-palette',
    name: 'Cube Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#00c6bf', '#fff7d6'],
    baseColor: BASE_COLOR,
    description: 'Compact triad for simple highlights.',
  },
  'switch-palette': {
    id: 'switch-palette',
    name: 'Switch Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#b6c0e8', '#d4a418', '#f1f1e6'],
    baseColor: BASE_COLOR,
    description: 'Cool base with warm accent switch.',
  },
  'small-switch-palette': {
    id: 'small-switch-palette',
    name: 'Small Switch Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#e3f4f3', '#40908c'],
    baseColor: BASE_COLOR,
    description: 'Minimal set for compact controls.',
  },
  'skip-gradient': {
    id: 'skip-gradient',
    name: 'Skip Gradient',
    category: 'gradient',
    colors: ['#0f1f3d', '#60ecbd', '#03b388', '#007d56'],
    baseColor: BASE_COLOR,
    description: 'Green spectrum useful for progress motion.',
  },
  'natural-palette': {
    id: 'natural-palette',
    name: 'Natural Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#558ef8', '#f7f9ff', '#f1f1e6'],
    baseColor: BASE_COLOR,
    description: 'Stable enterprise baseline.',
  },
  'matching-palette': {
    id: 'matching-palette',
    name: 'Matching Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#434656', '#a7aabd', '#413314', '#73613f'],
    baseColor: BASE_COLOR,
    description: 'Neutral and dark accents for dense management pages.',
  },
  'squash-palette': {
    id: 'squash-palette',
    name: 'Squash Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#572800', '#004145'],
    baseColor: BASE_COLOR,
    description: 'High contrast dark accents.',
  },
  'grey-friends': {
    id: 'grey-friends',
    name: 'Grey Friends',
    category: 'palette',
    colors: ['#0f1f3d', '#434656', '#a7aabd'],
    baseColor: BASE_COLOR,
    description: 'Low-noise neutral system.',
  },
  'dotting-palette': {
    id: 'dotting-palette',
    name: 'Dotting Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#a7aabd', '#3b1219', '#bfa5a7'],
    baseColor: BASE_COLOR,
    description: 'Includes soft risk color for status cues.',
  },
  'skip-shade-gradient': {
    id: 'skip-shade-gradient',
    name: 'Skip Shade Gradient',
    category: 'gradient',
    colors: ['#0f1f3d', '#006287', '#00aeba', '#6ffacb'],
    baseColor: BASE_COLOR,
    description: 'Blue-teal depth gradient.',
  },
  threedom: {
    id: 'threedom',
    name: 'Threedom',
    category: 'palette',
    colors: ['#0f1f3d', '#5a2515', '#005238'],
    baseColor: BASE_COLOR,
    description: 'Three-tone dark palette.',
  },
  'highlight-palette': {
    id: 'highlight-palette',
    name: 'Highlight Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#368eff', '#f1f1e6', '#fff7d6'],
    baseColor: BASE_COLOR,
    description: 'Readable highlights for KPI blocks.',
  },
  'neighbor-palette': {
    id: 'neighbor-palette',
    name: 'Neighbor Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#00c6bf', '#188580', '#334b49'],
    baseColor: BASE_COLOR,
    description: 'Teal family for workflow and pipeline visuals.',
  },
  'discreet-palette': {
    id: 'discreet-palette',
    name: 'Discreet Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#558ef8', '#f5f9ff', '#fff7d6'],
    baseColor: BASE_COLOR,
    description: 'Current recommended default for ERP UI.',
  },
  'dust-palette': {
    id: 'dust-palette',
    name: 'Dust Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#a7aabd', '#737687', '#6d3e44'],
    baseColor: BASE_COLOR,
    description: 'Muted quiet tone for documentation surfaces.',
  },
  collective: {
    id: 'collective',
    name: 'Collective',
    category: 'palette',
    colors: ['#0f1f3d', '#4a396d', '#712032'],
    baseColor: BASE_COLOR,
    description: 'Strategic, deep-accent palette.',
  },
  'friend-palette': {
    id: 'friend-palette',
    name: 'Friend palette',
    category: 'palette',
    colors: ['#0f1f3d', '#a0aad1', '#b68a00', '#624100'],
    baseColor: BASE_COLOR,
    description: 'Blue and warm-gold balance.',
  },
  'pin-palette': {
    id: 'pin-palette',
    name: 'Pin Palette',
    category: 'palette',
    colors: ['#0f1f3d', '#368eff', '#f1f1e6', '#f3bf3a'],
    baseColor: BASE_COLOR,
    description: 'Strong pin and emphasis color set.',
  },
  shades: {
    id: 'shades',
    name: 'Shades',
    category: 'shade',
    colors: ['#0f1f3d', '#394567', '#656f94', '#929cc3', '#c2ccf5'],
    baseColor: BASE_COLOR,
    description: 'Structured monochrome navy scale.',
  },
  'random-shades': {
    id: 'random-shades',
    name: 'Random Shades',
    category: 'shade',
    colors: ['#0f1f3d', '#586286', '#d8e1ff', '#717ba0', '#364163'],
    baseColor: BASE_COLOR,
    description: 'Variant shade set with irregular ordering.',
  },
}

export function getPalette(id: PaletteId): PalettePreset {
  return PALETTE_LIBRARY[id]
}

export function listAllPalettes(): PalettePreset[] {
  return PALETTE_ID_ORDER.map((id) => PALETTE_LIBRARY[id])
}

export function listPalettesByCategory(category: PaletteCategory): PalettePreset[] {
  return listAllPalettes().filter((palette) => palette.category === category)
}
