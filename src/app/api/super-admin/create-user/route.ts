import { NextResponse } from 'next/server'
import { adminClient, authClient } from '../../../../lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

type CreateUserPayload = {
  email: string
  password: string
  crewCode?: string
  role: 'admin' | 'jury' | 'race_control' | 'REGISTRATION_APPROVER' | 'DRAW_MANAGER' | 'CHECKER' | 'FINISHER' | 'RACE_DIRECTOR' | 'MC'
}

const normalizeCrewCode = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

const validateCrewCode = (crewCode: string) => !crewCode || /^[A-Z0-9-]{3,32}$/.test(crewCode)

const crewCodeInUse = async (crewCode: string) => {
  if (!crewCode) return false
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error('Gagal memeriksa kode crew.')
  return data.users.some((user) => {
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
    return normalizeCrewCode(metadata.crew_code) === crewCode
  })
}

export async function POST(req: Request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Supabase environment variables belum lengkap.' },
      { status: 500 }
    )
  }

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const meta = (userData.user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (userData.user.app_metadata ?? {}) as Record<string, unknown>
  const role =
    (typeof meta.role === 'string' ? meta.role : null) ||
    (typeof appMeta.role === 'string' ? appMeta.role : null)

  if (String(role ?? '').toUpperCase() !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as CreateUserPayload

  if (!body?.email || !body?.password || !body?.role) {
    return NextResponse.json({ error: 'Payload tidak lengkap.' }, { status: 400 })
  }

  const crewCode = normalizeCrewCode(body.crewCode)
  if (!validateCrewCode(crewCode)) {
    return NextResponse.json({ error: 'Kode crew gunakan 3-32 karakter: huruf, angka, atau tanda hubung.' }, { status: 400 })
  }
  if (crewCode && !/^\d{6}$/.test(body.password)) {
    return NextResponse.json({ error: 'Akun dengan kode crew wajib memakai PIN 6 digit.' }, { status: 400 })
  }
  if (await crewCodeInUse(crewCode)) {
    return NextResponse.json({ error: 'Kode crew sudah dipakai akun lain.' }, { status: 409 })
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { role: body.role, ...(crewCode ? { crew_code: crewCode } : {}) },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ user: data.user })
}
