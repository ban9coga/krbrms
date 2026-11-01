export const DRAW_BATCH_MODES = ['AUTO_BY_GATE', 'MANUAL_BATCH_COUNT', 'CUSTOM_BATCH_SIZES'] as const
export type DrawBatchMode = (typeof DRAW_BATCH_MODES)[number]

export const DRAW_MOTO2_ORDERS = ['REVERSE', 'SAME', 'MIDDLE'] as const
export type DrawMoto2Order = (typeof DRAW_MOTO2_ORDERS)[number]
export const DRAW_MOTO3_ORDERS = ['REVERSE', 'SAME', 'ODD_EVEN'] as const
export type DrawMoto3Order = (typeof DRAW_MOTO3_ORDERS)[number]

export const QUALIFICATION_BATCH_MODES = ['FIXED', 'ROTATE_EACH_MOTO'] as const
export type QualificationBatchMode = (typeof QUALIFICATION_BATCH_MODES)[number]

export const normalizeQualificationBatchMode = (value: unknown): QualificationBatchMode =>
  QUALIFICATION_BATCH_MODES.includes(value as QualificationBatchMode)
    ? (value as QualificationBatchMode)
    : 'FIXED'

export type DrawCategoryConfig = {
  batch_mode: DrawBatchMode
  batch_size: number | null
  batch_count: number | null
  custom_batch_sizes: number[]
  moto2_order: DrawMoto2Order
  moto3_order: DrawMoto3Order
}

export const DEFAULT_DRAW_CATEGORY_CONFIG: DrawCategoryConfig = {
  batch_mode: 'AUTO_BY_GATE',
  batch_size: null,
  batch_count: null,
  custom_batch_sizes: [],
  moto2_order: 'REVERSE',
  moto3_order: 'SAME',
}

const positiveInteger = (value: unknown) => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

export const normalizeDrawCategoryConfig = (value: unknown): DrawCategoryConfig => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const batchMode = DRAW_BATCH_MODES.includes(source.batch_mode as DrawBatchMode)
    ? (source.batch_mode as DrawBatchMode)
    : DEFAULT_DRAW_CATEGORY_CONFIG.batch_mode
  const moto2Order = DRAW_MOTO2_ORDERS.includes(source.moto2_order as DrawMoto2Order)
    ? (source.moto2_order as DrawMoto2Order)
    : DEFAULT_DRAW_CATEGORY_CONFIG.moto2_order
  const moto3Order = DRAW_MOTO3_ORDERS.includes(source.moto3_order as DrawMoto3Order)
    ? (source.moto3_order as DrawMoto3Order)
    : DEFAULT_DRAW_CATEGORY_CONFIG.moto3_order
  const batchSize = positiveInteger(source.batch_size)
  const batchCount = positiveInteger(source.batch_count)
  const customBatchSizes = Array.isArray(source.custom_batch_sizes)
    ? source.custom_batch_sizes.map(positiveInteger).filter((item): item is number => item !== null)
    : []

  return {
    batch_mode: batchMode,
    batch_size: batchSize,
    batch_count: batchCount,
    custom_batch_sizes: customBatchSizes,
    moto2_order: moto2Order,
    moto3_order: moto3Order,
  }
}
