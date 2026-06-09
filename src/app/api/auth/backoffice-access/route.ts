import { NextResponse } from 'next/server'
import { getAccessibleEventIds, requireBackoffice } from '../../../../lib/auth'

const getHomePath = async (role: string, userId: string) => {
  if (role === 'REGISTRATION_APPROVER') {
    const eventIds = await getAccessibleEventIds(userId, ['REGISTRATION_APPROVER'])
    return eventIds.length === 1 ? `/admin/events/${eventIds[0]}/registrations` : '/admin/events'
  }
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
      home: await getHomePath(auth.role, auth.user.id),
    },
  })
}
