export const assertMotoEditable = (motoStatus?: string | null) => {
  if ((motoStatus ?? '').toLowerCase() === 'locked') {
    throw new Error('Moto already locked. No modification allowed.')
  }
}

export const assertMotoNotUnderProtest = (motoStatus?: string | null) => {
  if ((motoStatus ?? '').toLowerCase() === 'protest_review') {
    throw new Error('Moto under protest review. Modifications are frozen.')
  }
}
