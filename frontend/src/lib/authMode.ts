const DISABLED_FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

// Auth is intentionally disabled by default until the multi-user flow is reintroduced.
export const AUTH_DISABLED = !DISABLED_FALSE_VALUES.has(
  String(import.meta.env.VITE_AUTH_DISABLED ?? 'true').trim().toLowerCase(),
)
