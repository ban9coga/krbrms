import { isMotoLocked, isMotoUnderProtest } from './motoStatus'

export const assertMotoEditable = (motoStatus?: string | null) => {
  if (isMotoLocked(motoStatus)) {
    throw new Error('Moto already locked. No modification allowed.')
  }
}

export const assertMotoNotUnderProtest = (motoStatus?: string | null) => {
  if (isMotoUnderProtest(motoStatus)) {
    throw new Error('Moto under protest review. Modifications are frozen.')
  }
}
