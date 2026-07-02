import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../../lib/auth'
import {
  prepareRegistrationUploadFile,
  requireRegistrationUploadToken,
  uploadRegistrationStorageObject,
} from '../../../../../../../../lib/registrationUploads'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireRegistrationUploadToken(req, eventId, registrationId)
  if (!auth.ok) return auth.res

  const form = await req.formData()
  const file = form.get('file')
  const itemId = form.get('registration_item_id')?.toString() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Foto rider wajib diupload.' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Foto rider harus berupa gambar.' }, { status: 400 })
  }
  if (!itemId) {
    return NextResponse.json({ error: 'registration_item_id required' }, { status: 400 })
  }

  const { data: itemRow, error: itemErr } = await adminClient
    .from('registration_items')
    .select('id')
    .eq('id', itemId)
    .eq('registration_id', registrationId)
    .maybeSingle()
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 })
  if (!itemRow) return NextResponse.json({ error: 'registration_item_id not found' }, { status: 404 })

  let upload
  try {
    upload = await prepareRegistrationUploadFile(file, {
      kind: 'rider-photo',
      label: 'Foto rider',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Foto rider gagal diproses.' }, { status: 400 })
  }
  const path = `${eventId}/${registrationId}/${itemId}-photo-${Date.now()}.${upload.extension}`

  const storagePath = `events/${path}`
  try {
    await uploadRegistrationStorageObject(storagePath, upload)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Foto rider gagal diupload.' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('registration_items')
    .update({ photo_url: storagePath })
    .eq('id', itemId)
    .eq('registration_id', registrationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { photo_url: storagePath } })
}
