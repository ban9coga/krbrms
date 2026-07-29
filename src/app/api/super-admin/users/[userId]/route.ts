import { NextResponse } from 'next/server'
import { adminClient, authClient } from '../../../../../lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const getRoleFromUser = (user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) => {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
  return (typeof meta.role === 'string' ? meta.role : null) || (typeof appMeta.role === 'string' ? appMeta.role : null)
}

const normalizeCrewCode = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

async function requireSuperAdmin(req: Request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return { ok: false as const, res: NextResponse.json({ error: 'Supabase env belum lengkap.' }, { status: 500 }) }
  }
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) {
    return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const role = getRoleFromUser(data.user)
  if (String(role ?? '').toUpperCase() !== 'SUPER_ADMIN') {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, user: data.user }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  const { userId } = await params
  const body = (await req.json()) as { role?: string; crewCode?: string; password?: string }
  if (!body?.role) return NextResponse.json({ error: 'Role wajib diisi.' }, { status: 400 })

  const crewCode = normalizeCrewCode(body.crewCode)
  const nextPassword = typeof body.password === 'string' ? body.password : ''
  if (crewCode && !/^[A-Z0-9-]{3,32}$/.test(crewCode)) {
    return NextResponse.json({ error: 'Kode crew gunakan 3-32 karakter: huruf, angka, atau tanda hubung.' }, { status: 400 })
  }

  const [{ data: targetUser, error: targetError }, { data: users, error: usersError }] = await Promise.all([
    adminClient.auth.admin.getUserById(userId),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])
  if (targetError || !targetUser.user || usersError) {
    return NextResponse.json({ error: 'Gagal memeriksa akun.' }, { status: 400 })
  }
  const duplicate = users.users.some((user) => {
    if (user.id === userId || !crewCode) return false
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
    return normalizeCrewCode(metadata.crew_code) === crewCode
  })
  if (duplicate) return NextResponse.json({ error: 'Kode crew sudah dipakai akun lain.' }, { status: 409 })

  const existingMetadata = (targetUser.user.user_metadata ?? {}) as Record<string, unknown>
  const existingCrewCode = normalizeCrewCode(existingMetadata.crew_code)
  if (crewCode && !existingCrewCode && !/^\d{6}$/.test(nextPassword)) {
    return NextResponse.json({ error: 'Saat menambahkan kode crew, isi PIN baru enam digit.' }, { status: 400 })
  }
  if (nextPassword && !/^\d{6}$/.test(nextPassword)) {
    return NextResponse.json({ error: 'PIN baru harus tepat enam digit.' }, { status: 400 })
  }
  const userMetadata: Record<string, unknown> = { ...existingMetadata, role: body.role }
  if (crewCode) userMetadata.crew_code = crewCode
  else delete userMetadata.crew_code

  const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: userMetadata,
    ...(nextPassword ? { password: nextPassword } : {}),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ user: data.user })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  const { userId } = await params
  if (auth.user.id === userId) {
    return NextResponse.json({ error: 'Tidak boleh menghapus akun sendiri.' }, { status: 400 })
  }

  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
