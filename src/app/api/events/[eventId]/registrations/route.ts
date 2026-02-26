import { NextResponse } from 'next/server'

const gone = () =>
  NextResponse.json(
    {
      error:
        'Endpoint deprecated. Use POST /api/public/events/{eventId}/registrations for public registration and GET /api/admin/events/{eventId}/registrations for admin listing.',
    },
    { status: 410 }
  )

export async function GET() {
  return gone()
}

export async function POST() {
  return gone()
}
