import { NextResponse } from 'next/server'
import { adminClient, authClient } from '../../../../lib/auth'

export async function GET(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase environment variables belum lengkap.' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  if (userError || !userData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meta = (userData.user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (userData.user.app_metadata ?? {}) as Record<string, unknown>
  const role =
    (typeof meta.role === 'string' ? meta.role : null) ||
    (typeof appMeta.role === 'string' ? appMeta.role : null)

  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') ?? '1')
  const perPage = Number(searchParams.get('per_page') ?? '50')

  const { data, error } = await adminClient.auth.admin.listUsers({
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : 50,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    data: data.users,
    total: data.total,
    page: data.page,
    per_page: data.perPage,
  })
}
