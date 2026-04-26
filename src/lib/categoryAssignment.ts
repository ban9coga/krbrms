export type CategoryGender = 'BOY' | 'GIRL' | 'MIX'

export type CategoryAssignmentItem = {
  id: string
  year: number
  year_min?: number | null
  year_max?: number | null
  gender: CategoryGender
}

export type RiderCategoryGender = 'BOY' | 'GIRL'

export type RiderCategorySnapshot = {
  primary_category_id?: string | null
  birth_year?: number | null
  date_of_birth?: string | null
  gender: RiderCategoryGender
}

export const getCategoryMinYear = (category: Pick<CategoryAssignmentItem, 'year' | 'year_min'>) =>
  category.year_min ?? category.year

export const getCategoryMaxYear = (category: Pick<CategoryAssignmentItem, 'year' | 'year_max'>) =>
  category.year_max ?? category.year

export const isCategoryGenderCompatible = (
  categoryGender: CategoryGender,
  riderGender: RiderCategoryGender
) => categoryGender === riderGender || categoryGender === 'MIX'

export const isCategoryInRange = (
  category: Pick<CategoryAssignmentItem, 'year' | 'year_min' | 'year_max'>,
  birthYear: number
) => birthYear >= getCategoryMinYear(category) && birthYear <= getCategoryMaxYear(category)

const compareGenderPreference = (
  a: Pick<CategoryAssignmentItem, 'gender'>,
  b: Pick<CategoryAssignmentItem, 'gender'>,
  riderGender: RiderCategoryGender
) => {
  const aRank = a.gender === riderGender ? 0 : a.gender === 'MIX' ? 1 : 2
  const bRank = b.gender === riderGender ? 0 : b.gender === 'MIX' ? 1 : 2
  return aRank - bRank
}

export const getExactPrimaryCategoryCandidates = <T extends CategoryAssignmentItem>(
  categories: T[],
  birthYear: number,
  riderGender: RiderCategoryGender
) =>
  categories
    .filter((category) => isCategoryInRange(category, birthYear) && isCategoryGenderCompatible(category.gender, riderGender))
    .sort((a, b) => {
      const genderCompare = compareGenderPreference(a, b, riderGender)
      if (genderCompare !== 0) return genderCompare
      const maxCompare = getCategoryMaxYear(a) - getCategoryMaxYear(b)
      if (maxCompare !== 0) return maxCompare
      return getCategoryMinYear(a) - getCategoryMinYear(b)
    })

export const getFallbackPrimaryCategoryCandidates = <T extends CategoryAssignmentItem>(
  categories: T[],
  birthYear: number,
  riderGender: RiderCategoryGender
) =>
  categories
    .filter((category) => getCategoryMaxYear(category) < birthYear && isCategoryGenderCompatible(category.gender, riderGender))
    .sort((a, b) => {
      const maxCompare = getCategoryMaxYear(b) - getCategoryMaxYear(a)
      if (maxCompare !== 0) return maxCompare
      const genderCompare = compareGenderPreference(a, b, riderGender)
      if (genderCompare !== 0) return genderCompare
      return getCategoryMinYear(b) - getCategoryMinYear(a)
    })

const getBirthYear = (rider: Pick<RiderCategorySnapshot, 'birth_year' | 'date_of_birth'>) => {
  if (typeof rider.birth_year === 'number' && Number.isFinite(rider.birth_year)) {
    return rider.birth_year
  }
  const raw = String(rider.date_of_birth ?? '').slice(0, 4)
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export const riderBelongsToPrimaryCategory = (
  rider: RiderCategorySnapshot,
  category: CategoryAssignmentItem
) => {
  if (typeof rider.primary_category_id === 'string' && rider.primary_category_id.length > 0) {
    return rider.primary_category_id === category.id
  }

  const birthYear = getBirthYear(rider)
  if (!birthYear) return false
  return isCategoryInRange(category, birthYear) && isCategoryGenderCompatible(category.gender, rider.gender)
}
