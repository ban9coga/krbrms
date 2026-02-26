import { NextResponse } from 'next/server'

const gone = () =>
  NextResponse.json(
    {
      error:
        'Endpoint deprecated. Use /api/admin/events/{eventId}/registrations/{registrationId} for review actions and /api/public/events/{eventId}/registrations/{registrationId}/* for upload flows.',
    },
    { status: 410 }
  )

export async function GET() {
  return gone()
}

export async function PATCH() {
  return gone()
}
