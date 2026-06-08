import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'

const BUCKET = 'event-logos'
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

const isSafePath = (path: string) => {
  if (!path || path.startsWith('/') || path.includes('\\')) return false
  return path.split('/').every((part) => part && part !== '.' && part !== '..')
}

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const storagePath = path.join('/')

  if (!isSafePath(storagePath)) {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 })
  }

  const { data, error } = await adminClient.storage.from(BUCKET).download(storagePath)
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Media not found' }, { status: 404 })
  }

  const headers = new Headers()
  headers.set('Cache-Control', CACHE_CONTROL)
  if (data.type) headers.set('Content-Type', data.type)

  return new Response(data, { headers })
}
