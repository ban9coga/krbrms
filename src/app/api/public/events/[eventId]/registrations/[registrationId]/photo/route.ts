import { NextResponse } from 'next/server'

const gone = () =>
  NextResponse.json(
    {
      error:
        'Endpoint deprecated. Uploads must be submitted atomically via POST /api/public/events/{eventId}/registrations (multipart/form-data).',
    },
    { status: 410 }
  )

export const runtime = 'nodejs'

export async function POST() {
  return gone()
}

