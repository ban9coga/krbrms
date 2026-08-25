import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '@/src/lib/auth'

const BUCKET = 'insight-assets'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const ensureBucket = async () => {
  const { data, error } = await adminClient.storage.getBucket(BUCKET)
  if (data) return null
  if (error && !/not found/i.test(error.message)) return error
  const { error: createError } = await adminClient.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE}`,
    allowedMimeTypes: Array.from(ALLOWED_TYPES),
  })
  return createError
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file')
  const placement = formData.get('placement') === 'cover' ? 'covers' : 'articles'
  if (!(file instanceof File)) return NextResponse.json({ error: 'File gambar wajib dipilih.' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Gunakan gambar JPG, PNG, atau WebP.' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Ukuran gambar harus lebih kecil dari 10 MB.' }, { status: 400 })
  }

  const bucketError = await ensureBucket()
  if (bucketError) return NextResponse.json({ error: bucketError.message }, { status: 500 })

  const path = `insight/${placement}/${randomUUID()}.${extensionByMime[file.type]}`
  const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ data: { url: data.publicUrl, path } }, { status: 201 })
}
