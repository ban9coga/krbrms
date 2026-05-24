export const normalizeAppRole = (value: string | null | undefined) => {
  const upper = String(value ?? '').trim().toUpperCase()
  if (!upper) return ''
  if (upper === 'JURY_START') return 'CHECKER'
  if (upper === 'JURY_FINISH') return 'FINISHER'
  if (upper === 'RACE_CONTROL') return 'RACE_CONTROL'
  if (upper === 'RACE_DIRECTOR') return 'RACE_DIRECTOR'
  if (upper === 'REGISTRATION_APPROVER') return 'REGISTRATION_APPROVER'
  if (upper === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (upper === 'ADMIN') return 'ADMIN'
  if (upper === 'CHECKER' || upper === 'FINISHER' || upper === 'MC') return upper
  return upper
}

export const formatAppRoleLabel = (value: string | null | undefined) => {
  const role = normalizeAppRole(value)
  if (role === 'SUPER_ADMIN') return 'Central Admin'
  if (role === 'ADMIN') return 'Operator Admin'
  if (role === 'REGISTRATION_APPROVER') return 'Registration Approver'
  if (role === 'CHECKER') return 'Checker'
  if (role === 'FINISHER') return 'Finisher'
  if (role === 'RACE_DIRECTOR') return 'Race Director'
  if (role === 'RACE_CONTROL') return 'Race Control'
  if (role === 'MC') return 'MC'
  return role || 'Unknown'
}

export const isEventAdminRole = (value: string | null | undefined) => {
  const role = normalizeAppRole(value)
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export const canAccessAdminWorkspace = (value: string | null | undefined) => {
  const role = normalizeAppRole(value)
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'REGISTRATION_APPROVER'
}

export const isRegistrationApproverRole = (value: string | null | undefined) => {
  return normalizeAppRole(value) === 'REGISTRATION_APPROVER'
}
