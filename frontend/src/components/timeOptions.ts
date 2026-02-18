const DEFAULT_TIME_OPTIONS: string[] = [
  '5m', '10m', '15m', '20m', '30m', '45m',
  '1h', '1h 30m', '2h', '2h 30m', '3h', '3h 30m', '4h',
  '5h', '6h', '8h', '1d',
]

export const TIME_OPTIONS = [...DEFAULT_TIME_OPTIONS]

export const HOUR_OPTIONS = Array.from({ length: 19 }, (_, i) => {
  const h = Math.floor(i / 2) + 9
  const m = (i % 2) * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})
