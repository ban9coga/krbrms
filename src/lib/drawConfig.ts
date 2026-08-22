export const DRAW_BATCH_MODES = ['AUTO_BY_GATE', 'MANUAL_BATCH_COUNT', 'CUSTOM_BATCH_SIZES'] as const
export type DrawBatchMode = (typeof DRAW_BATCH_MODES)[number]

export const DRAW_MOTO2_ORDERS = ['REVERSE', 'SAME'] as const
export type DrawMoto2Order = (typeof DRAW_MOTO2_ORDERS)[number]

export type DrawCategoryConfig = {
  batch_mode: DrawBatchMode
  batch_size: number | null
  batch_count: number | null
  custom_batch_sizes: number[]
  moto2_order: DrawMoto2Order
}

export const DEFAULT_DRAW_CATEGORY_CONFIG: DrawCategoryConfig = {
  batch_mode: 'AUTO_BY_GATE',
  batch_size: null,
  batch_count: null,
  custom_batch_sizes: [],
  moto2_order: 'REVERSE',
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
  }
}
