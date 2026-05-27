import { compareMotoSequence } from './motoSequence'

type MotoLike = {
  moto_name: string
  moto_order: number
}

const FINAL_MOTO_DISPLAY_ORDER: Record<string, number> = {
  ACADEMY: 0,
  ROOKIE: 1,
  PRO: 2,
  NOVICE: 3,
  ELITE: 4,
  ADVANCED: 5,
  AMATEUR: 6,
  BEGINNER: 7,
}

export const parseFinalMotoClass = (motoName: string) => {
  const match = motoName.match(/^final\s+(.+)$/i)
  if (!match) return null
  return match[1]?.trim().toUpperCase() ?? null
}

export const compareMotoDisplayOrder = <T extends MotoLike>(a: T, b: T) => {
  const finalClassA = parseFinalMotoClass(a.moto_name)
  const finalClassB = parseFinalMotoClass(b.moto_name)
  if (finalClassA && finalClassB) {
    const orderDiff =
      (FINAL_MOTO_DISPLAY_ORDER[finalClassA] ?? Number.MAX_SAFE_INTEGER) -
      (FINAL_MOTO_DISPLAY_ORDER[finalClassB] ?? Number.MAX_SAFE_INTEGER)
    if (orderDiff !== 0) return orderDiff
  }
  return compareMotoSequence(a, b)
}
