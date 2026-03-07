# 0F1F3D Palette Library

## Summary
- Base anchor color: `#0f1f3d`
- Source: user-provided palette sets (saved on 2026-03-07)
- Current runtime default (recommended): `Discreet Palette`
- Current runtime tone: `Muted Enterprise` (silver-blue baseline + amber warning + muted-wine danger)

## Usage Model
- Documentation reference: this file
- Code tokens: `frontend/src/styles/paletteLibrary.ts`
- Semantic role mapping: `frontend/src/styles/paletteRoles.ts`

## Quick Recommended Sets
| Name | Colors | Suggested Context |
|---|---|---|
| Discreet Palette (default) | `#0f1f3d #558ef8 #f5f9ff #fff7d6` | Main ERP baseline, balanced contrast |
| Natural Palette | `#0f1f3d #558ef8 #f7f9ff #f1f1e6` | Conservative enterprise tone |
| Highlight Palette | `#0f1f3d #368eff #f1f1e6 #fff7d6` | KPI/alert heavy screens |

## Muted Enterprise Runtime Palette
| Role | Hex | Usage |
|---|---|---|
| Primary | `#0f1f3d` | Navigation, primary actions |
| Accent | `#558ef8` | Active state, links, focus emphasis |
| Base Background | `#f5f9ff` | App canvas and neutral highlight |
| Surface | `#ffffff` | Cards, panels, modal surfaces |
| Border | `#d8e5fb` | Dividers and card boundaries |
| Warning Main | `#b68a00` | Warning dots/progress accents |
| Warning Surface | `#fff7d6` | Warning badges/banners |
| Warning Border | `#d4a418` | Warning outlines |
| Warning Text | `#624100` | Warning foreground text |
| Danger Main | `#6d3e44` | Critical indicators |
| Danger Surface | `#f1e8e9` | Danger badges/banners |
| Danger Border | `#bfa5a7` | Danger outlines |
| Danger Text | `#3b1219` | Danger foreground text |

## Gradient Sets
| Name | Type | Colors | Recommended Use | Notes |
|---|---|---|---|---|
| Generic Gradient | Gradient | `#0f1f3d #004b6f #007b8e #00ab8f #80d77d #f9f871` | Hero-like strips, visual analytics accents | Wide cool-to-warm ramp |
| Matching Gradient | Gradient | `#0f1f3d #3a395f #665481 #9671a1 #c98fbf #feafdb` | Soft thematic backgrounds | Purple-pink progression |
| Skip Gradient | Gradient | `#0f1f3d #60ecbd #03b388 #007d56` | Status transitions, progress visuals | Green-centric |
| Skip Shade Gradient | Gradient | `#0f1f3d #006287 #00aeba #6ffacb` | Data gradients, charts | Blue-teal progression |

## Spot Sets
| Name | Type | Colors | Recommended Use | Notes |
|---|---|---|---|---|
| Spot Palette | Spot | `#0f1f3d #3f4a6d #e7efff #d4a418` | Brand + highlight chips | Includes neutral light and gold |
| Twisted Spot Palette | Spot | `#0f1f3d #d4a418 #ffeeca #867555` | Premium warning/highlight moments | Gold-heavy |

## Palette Sets
| Name | Type | Colors | Recommended Use | Notes |
|---|---|---|---|---|
| Classy Palette | Palette | `#0f1f3d #a7aabd #737687 #3b1219 #6d3e44` | Formal reporting UI | Muted navy + wine tones |
| Cube Palette | Palette | `#0f1f3d #00c6bf #fff7d6` | Dashboard accents | Minimal triad |
| Switch Palette | Palette | `#0f1f3d #b6c0e8 #d4a418 #f1f1e6` | Module-level highlighting | Cool + gold balance |
| Small Switch Palette | Palette | `#0f1f3d #e3f4f3 #40908c` | Compact chips/tables | Teal-neutral micro palette |
| Natural Palette | Palette | `#0f1f3d #558ef8 #f7f9ff #f1f1e6` | Enterprise baseline | Stable and familiar |
| Matching Palette | Palette | `#0f1f3d #434656 #a7aabd #413314 #73613f` | Dense data pages | Neutral-dark tone |
| Squash Palette | Palette | `#0f1f3d #572800 #004145` | Contrasting dark accents | Limited use set |
| Grey Friends | Palette | `#0f1f3d #434656 #a7aabd` | Neutral UI system | Good for low-noise UI |
| Dotting Palette | Palette | `#0f1f3d #a7aabd #3b1219 #bfa5a7` | Warnings and critical markers | Includes soft risk color |
| Threedom | Palette | `#0f1f3d #5a2515 #005238` | High-contrast sections | Tri-tone dark palette |
| Highlight Palette | Palette | `#0f1f3d #368eff #f1f1e6 #fff7d6` | KPI, callouts, highlights | Strong readable accent |
| Neighbor Palette | Palette | `#0f1f3d #00c6bf #188580 #334b49` | Workflow/pipeline visuals | Teal family |
| Discreet Palette | Palette | `#0f1f3d #558ef8 #f5f9ff #fff7d6` | Default app semantic mapping | Current recommended default |
| Dust Palette | Palette | `#0f1f3d #a7aabd #737687 #6d3e44` | Quiet document-heavy screens | Subdued mood |
| Collective | Palette | `#0f1f3d #4a396d #712032` | Strategic overview pages | Deep accent palette |
| Friend palette | Palette | `#0f1f3d #a0aad1 #b68a00 #624100` | Warm-highlight reporting pages | Blue + gold-brown |
| Pin Palette | Palette | `#0f1f3d #368eff #f1f1e6 #f3bf3a` | Alert pins, emphasis badges | Active highlight tone |

## Shade Sets
| Name | Type | Colors | Recommended Use | Notes |
|---|---|---|---|---|
| Shades | Shade | `#0f1f3d #394567 #656f94 #929cc3 #c2ccf5` | Monochrome UI scale | Structured navy scale |
| Random Shades | Shade | `#0f1f3d #586286 #d8e1ff #717ba0 #364163` | Variant neutral depth | Irregular shade order |

## Notes
- Keep semantic readability first: text contrast and table legibility are prioritized over stylistic variety.
- Runtime semantics are split: warning uses amber (`#b68a00` family), danger uses muted-wine (`#6d3e44` family).
- Runtime palette switching is not included in this step.
