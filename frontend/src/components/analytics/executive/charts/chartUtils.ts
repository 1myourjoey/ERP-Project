export function truncateChartLabel(value: unknown, maxLength = 10) {
  const text = String(value ?? '')
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`
}

function getCompactDigits(scaled: number) {
  const abs = Math.abs(scaled)
  if (abs >= 100) return 0
  if (abs >= 10) return 1
  return 2
}

export function formatExecutiveNumber(value: unknown, compact = false) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return String(value ?? '-')

  if (!compact) {
    return numeric.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  }

  const abs = Math.abs(numeric)
  if (abs >= 1_0000_0000_0000) {
    const scaled = numeric / 1_0000_0000_0000
    return `${scaled.toLocaleString('ko-KR', { maximumFractionDigits: getCompactDigits(scaled) })}조`
  }
  if (abs >= 1_0000_0000) {
    const scaled = numeric / 1_0000_0000
    return `${scaled.toLocaleString('ko-KR', { maximumFractionDigits: getCompactDigits(scaled) })}억`
  }
  if (abs >= 1_0000) {
    const scaled = numeric / 1_0000
    return `${scaled.toLocaleString('ko-KR', { maximumFractionDigits: getCompactDigits(scaled) })}만`
  }

  return numeric.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
}
