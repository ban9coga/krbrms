type MotoLike = {
  moto_name?: string | null
  moto_order?: number | null
  category_id?: string | null
}

type ParsedMoto = {
  motoIndex: number
  batchIndex: number
}

export const parseMotoSequence = (name?: string | null): ParsedMoto | null => {
  if (!name) return null
  const match = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return null
  const motoIndex = Number(match[1])
  const batchIndex = Number(match[2])
  if (!Number.isFinite(motoIndex) || !Number.isFinite(batchIndex)) return null
  return { motoIndex, batchIndex }
}

export const compareMotoSequence = (a: MotoLike, b: MotoLike) => {
  const aCategory = typeof a.category_id === 'string' ? a.category_id : null
  const bCategory = typeof b.category_id === 'string' ? b.category_id : null
  if (aCategory && bCategory && aCategory !== bCategory) {
    const ao = typeof a.moto_order === 'number' ? a.moto_order : 0
    const bo = typeof b.moto_order === 'number' ? b.moto_order : 0
    return ao - bo
  }

  const parsedA = parseMotoSequence(a.moto_name)
  const parsedB = parseMotoSequence(b.moto_name)
  if (parsedA && parsedB) {
    if (parsedA.motoIndex !== parsedB.motoIndex) return parsedA.motoIndex - parsedB.motoIndex
    if (parsedA.batchIndex !== parsedB.batchIndex) return parsedA.batchIndex - parsedB.batchIndex
  }
  const ao = typeof a.moto_order === 'number' ? a.moto_order : 0
  const bo = typeof b.moto_order === 'number' ? b.moto_order : 0
  return ao - bo
}
