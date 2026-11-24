export type CategoryGender = 'BOY' | 'GIRL' | 'MIX'

export type CategoryAssignmentItem = {
  id: string
  year: number
  year_min?: number | null
  year_max?: number | null
  gender: CategoryGender
  category_basis?: 'BIRTH_YEAR' | 'AGE' | null
  age_min?: number | null
  age_max?: number | null
}

export type RiderCategoryGender = 'BOY' | 'GIRL'

export type RiderCategorySnapshot = {
  primary_category_id?: string | null
  birth_year?: number | null
  date_of_birth?: string | null
  gender: RiderCategoryGender
}

export const isMissingPrimaryCategoryColumnError = (message?: string | null) => {
  const normalized = String(message ?? '').toLowerCase()
  return (
    normalized.includes('primary_category_id') &&
    (normalized.includes('column') ||
      normalized.includes('schema cache') ||
      normalized.includes('could not find the') ||
      normalized.includes('does not exist'))
  )
}

export const missingPrimaryCategoryMigrationMessage =
  'Database belum siap untuk category utama rider. Jalankan migration docs/sql/migrations/2026-04-26_riders_primary_category.sql.'

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

export const calculateAgeOnDate = (dateOfBirth: string | null | undefined, eventDate: string | null | undefined) => {
  if (!dateOfBirth || !eventDate) return null
  const dobMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  const eventMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate)
  if (!dobMatch || !eventMatch) return null
  const birthYear = Number(dobMatch[1])
  const birthMonth = Number(dobMatch[2])
  const birthDay = Number(dobMatch[3])
  const raceYear = Number(eventMatch[1])
  const raceMonth = Number(eventMatch[2])
  const raceDay = Number(eventMatch[3])
  if (birthMonth < 1 || birthMonth > 12 || raceMonth < 1 || raceMonth > 12 || birthDay < 1 || raceDay < 1) return null
  const birth = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay))
  const race = new Date(Date.UTC(raceYear, raceMonth - 1, raceDay))
  if (birth.getUTCFullYear() !== birthYear || birth.getUTCMonth() !== birthMonth - 1 || birth.getUTCDate() !== birthDay) return null
  if (race.getUTCFullYear() !== raceYear || race.getUTCMonth() !== raceMonth - 1 || race.getUTCDate() !== raceDay || birth > race) return null
  let age = raceYear - birthYear
  if (raceMonth < birthMonth || (raceMonth === birthMonth && raceDay < birthDay)) age -= 1
  return age
}

export const isCategoryEligibleForRider = (
  category: CategoryAssignmentItem,
  birthYear: number,
  gender: RiderCategoryGender,
  dateOfBirth?: string | null,
  eventDate?: string | null
) => {
  if (!isCategoryGenderCompatible(category.gender, gender)) return false
  if (category.category_basis === 'AGE') {
    const age = calculateAgeOnDate(dateOfBirth, eventDate)
    return age != null && category.age_min != null && category.age_max != null && age >= category.age_min && age <= category.age_max
  }
  return isCategoryInRange(category, birthYear)
}

const compareGenderPreference = (
  a: Pick<CategoryAssignmentItem, 'gender'>,
  b: Pick<CategoryAssignmentItem, 'gender'>,
  riderGender: RiderCategoryGender
) => {
  const aRank = a.gender === riderGender ? 0 : a.gender === 'MIX' ? 1 : 2
  const bRank = b.gender === riderGender ? 0 : b.gender === 'MIX' ? 1 : 2
  return aRank - bRank
}

const compareCategoryBasisAndRange = (a: CategoryAssignmentItem, b: CategoryAssignmentItem) => {
  const aAge = a.category_basis === 'AGE'
  const bAge = b.category_basis === 'AGE'
  if (aAge !== bAge) return aAge ? -1 : 1
  if (aAge && bAge) {
    const widthCompare = (a.age_max ?? Infinity) - (a.age_min ?? 0) - ((b.age_max ?? Infinity) - (b.age_min ?? 0))
    if (widthCompare !== 0) return widthCompare
    return (a.age_min ?? Infinity) - (b.age_min ?? Infinity)
  }
  const maxCompare = getCategoryMaxYear(a) - getCategoryMaxYear(b)
  if (maxCompare !== 0) return maxCompare
  return getCategoryMinYear(a) - getCategoryMinYear(b)
}

export const getExactPrimaryCategoryCandidates = <T extends CategoryAssignmentItem>(
  categories: T[],
  birthYear: number,
  riderGender: RiderCategoryGender,
  dateOfBirth?: string | null,
  eventDate?: string | null
) =>
  categories
    .filter((category) => isCategoryEligibleForRider(category, birthYear, riderGender, dateOfBirth, eventDate))
    .sort((a, b) => {
      const genderCompare = compareGenderPreference(a, b, riderGender)
      if (genderCompare !== 0) return genderCompare
      return compareCategoryBasisAndRange(a, b)
    })

export const getFallbackPrimaryCategoryCandidates = <T extends CategoryAssignmentItem>(
  categories: T[],
  birthYear: number,
  riderGender: RiderCategoryGender,
  dateOfBirth?: string | null,
  eventDate?: string | null
) =>
  categories
    .filter((category) => {
      if (!isCategoryGenderCompatible(category.gender, riderGender)) return false
      if (category.category_basis === 'AGE') {
        const age = calculateAgeOnDate(dateOfBirth, eventDate)
        return age != null && category.age_min != null && category.age_min > age
      }
      return getCategoryMaxYear(category) < birthYear
    })
    .sort((a, b) => {
      const genderCompare = compareGenderPreference(a, b, riderGender)
      if (genderCompare !== 0) return genderCompare
      const aAge = a.category_basis === 'AGE'
      const bAge = b.category_basis === 'AGE'
      if (aAge !== bAge) return aAge ? -1 : 1
      if (aAge && bAge) return (a.age_min ?? Infinity) - (b.age_min ?? Infinity)
      const maxCompare = getCategoryMaxYear(b) - getCategoryMaxYear(a)
      if (maxCompare !== 0) return maxCompare
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
  category: CategoryAssignmentItem,
  eventDate?: string | null
) => {
  if (typeof rider.primary_category_id === 'string' && rider.primary_category_id.length > 0) {
    return rider.primary_category_id === category.id
  }

  const birthYear = getBirthYear(rider)
  if (!birthYear) return false
  return isCategoryEligibleForRider(category, birthYear, rider.gender, rider.date_of_birth, eventDate)
}
