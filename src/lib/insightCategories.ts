export const INSIGHT_CATEGORIES = [
  { value: 'RULES_SCORING', slug: 'rules-scoring', label: 'Rules & Scoring' },
  { value: 'RACE_KNOWLEDGE', slug: 'race-knowledge', label: 'Race Knowledge' },
  { value: 'RACE_ANALYSIS', slug: 'race-analysis', label: 'Race Analysis' },
  { value: 'EVENT_GUIDE', slug: 'event-guide', label: 'Event Guide' },
] as const

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number]['value']

export const getInsightCategory = (value: string | null | undefined) =>
  INSIGHT_CATEGORIES.find((category) => category.value === value) ?? null

export const getInsightCategoryFromSlug = (value: string | null | undefined) =>
  INSIGHT_CATEGORIES.find((category) => category.slug === value) ?? null

export const getInsightCategoryLabel = (value: InsightCategory) =>
  getInsightCategory(value)?.label ?? value
