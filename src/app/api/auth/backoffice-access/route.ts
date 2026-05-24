import { NextResponse } from 'next/server'
import { requireBackoffice } from '../../../../lib/auth'

const getHomePath = (role: string) => {
  if (role === 'REGISTRATION_APPROVER') return '/admin/events'
  return '/admin'
}

export async function GET(req: Request) {
  const auth = await requireBackoffice(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    data: {
      ok: true,
      role: auth.role,
      home: getHomePath(auth.role),
    },
  })
}
