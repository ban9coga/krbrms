import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../../lib/auth'
import {
  getRegistrationFileKind,
  prepareRegistrationUploadFile,
  requireRegistrationUploadToken,
  uploadRegistrationStorageObject,
} from '../../../../../../../../lib/registrationUploads'

const normalizeDocumentType = (value: unknown) => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'KK' || normalized === 'AKTE' || normalized === 'KIA') return normalized
  return null
}

const isDocumentTypeConstraintError = (message: string) =>
  /registration_documents_document_type_check|invalid input value for enum/i.test(message)

export const runtime = 'nodejs'

const REGISTRATION_DOCUMENT_RETURN_SELECT =
  'id, registration_id, registration_item_id, document_type, file_url, created_at'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireRegistrationUploadToken(req, eventId, registrationId)
  if (!auth.ok) return auth.res

  const form = await req.formData()
  const file = form.get('file')
  const rawDocumentType = form.get('document_type')
  const documentType = rawDocumentType === null ? 'KK' : normalizeDocumentType(rawDocumentType)
  const itemId = form.get('registration_item_id')?.toString() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Dokumen KK/Akte/KIA wajib diupload.' }, { status: 400 })
  }
  if (!documentType) {
    return NextResponse.json({ error: 'Invalid document_type' }, { status: 400 })
  }

  const { isImage, isPdf } = getRegistrationFileKind(file)
  if (!isImage && !isPdf) {
    return NextResponse.json({ error: 'Dokumen KK/Akte/KIA harus berupa gambar atau PDF.' }, { status: 400 })
  }

  if (itemId) {
    const { data: itemRow, error: itemErr } = await adminClient
      .from('registration_items')
      .select('id')
      .eq('id', itemId)
      .eq('registration_id', registrationId)
      .maybeSingle()
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 })
    if (!itemRow) return NextResponse.json({ error: 'registration_item_id not found' }, { status: 404 })
  }

  let upload
  try {
    upload = await prepareRegistrationUploadFile(file, {
      kind: 'document',
      label: 'Dokumen KK/Akte/KIA',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Dokumen KK/Akte/KIA gagal diproses.' }, { status: 400 })
  }
  const path = `${eventId}/${registrationId}/${itemId ?? 'general'}-${documentType}-${Date.now()}.${upload.extension}`

  const storagePath = `events/${path}`
  try {
    await uploadRegistrationStorageObject(storagePath, upload)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dokumen KK/Akte/KIA gagal diupload.' }, { status: 400 })
  }

  const insertDocument = async (type: string) =>
    adminClient
      .from('registration_documents')
      .insert({
        registration_id: registrationId,
        registration_item_id: itemId,
        document_type: type,
        file_url: storagePath,
      })
      .select(REGISTRATION_DOCUMENT_RETURN_SELECT)
      .single()

  let result = await insertDocument(documentType)
  if (
    result.error &&
    documentType === 'KIA' &&
    isDocumentTypeConstraintError(String(result.error.message))
  ) {
    result = await insertDocument('AKTE')
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ data: result.data })
}
