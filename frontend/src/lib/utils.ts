export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[]
  | { [key: string]: boolean | null | undefined }

function normalizeClassValue(input: ClassValue, output: string[]) {
  if (typeof input === 'string' || typeof input === 'number') {
    if (input) output.push(String(input))
    return
  }
  if (!input) return
  if (Array.isArray(input)) {
    for (const value of input) normalizeClassValue(value, output)
    return
  }
  for (const [key, enabled] of Object.entries(input)) {
    if (enabled) output.push(key)
  }
}

// Lightweight fallback for clsx + tailwind-merge style usage.
export function cn(...inputs: ClassValue[]) {
  const output: string[] = []
  for (const input of inputs) normalizeClassValue(input, output)
  return output.join(' ')
}
