import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const authClient = createClient(supabaseUrl, supabaseAnonKey)
const adminClient = createClient(supabaseUrl, supabaseServiceKey)

const getRoleFromUser = (user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) => {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
  return (typeof meta.role === 'string' ? meta.role : null) || (typeof appMeta.role === 'string' ? appMeta.role : null)
}

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
  if (role !== 'super_admin') {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, user: data.user }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.res

  const { userId } = await params
  const body = (await req.json()) as { role?: string }
  if (!body?.role) return NextResponse.json({ error: 'Role wajib diisi.' }, { status: 400 })

  const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: { role: body.role },
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
