import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const authClient = createClient(supabaseUrl, supabaseAnonKey)
const adminClient = createClient(supabaseUrl, supabaseServiceKey)

type CreateUserPayload = {
  email: string
  password: string
  role: 'admin' | 'jury' | 'race_control' | 'CHECKER' | 'FINISHER' | 'RACE_DIRECTOR' | 'MC'
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

  if (role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as CreateUserPayload

  if (!body?.email || !body?.password || !body?.role) {
    return NextResponse.json({ error: 'Payload tidak lengkap.' }, { status: 400 })
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { role: body.role },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ user: data.user })
}
