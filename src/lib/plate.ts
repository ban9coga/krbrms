type NormalizePlateNumberOptions = {
  maxDigits?: number
  digitsOnly?: boolean
}

type NormalizePlateSuffixOptions = {
  lettersOnly?: boolean
}

export const NO_PLATE_SUFFIX_KEY = '__NO_SUFFIX__'

export const normalizePlateNumber = (
  value: unknown,
  { maxDigits, digitsOnly = true }: NormalizePlateNumberOptions = {}
) => {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (digitsOnly) {
    const max = typeof maxDigits === 'number' && maxDigits > 0 ? `{1,${maxDigits}}` : '+'
    if (!new RegExp(`^\\d${max}$`).test(raw)) return null
  }
  return raw
}

export const normalizePlateSuffix = (value: unknown, { lettersOnly = true }: NormalizePlateSuffixOptions = {}) => {
  if (value === undefined || value === null) return null
  const raw = String(value).trim().toUpperCase()
  if (!raw) return null
  const suffix = raw[0]
  if (lettersOnly && !/^[A-Z]$/.test(suffix)) return null
  return suffix
}

export const suggestPlateSuffix = (used: Iterable<string | null | undefined>) => {
  const existing = new Set(
    Array.from(used)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().toUpperCase())
  )
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const letter of alphabet) {
    if (!existing.has(letter)) return letter
  }
  return null
}

export const nextAvailablePlateSuffix = suggestPlateSuffix

export const formatPlateDisplay = (plateNumber: string | null | undefined, plateSuffix?: string | null) =>
  `${plateNumber ?? ''}${plateSuffix ?? ''}`
