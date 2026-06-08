import sharp from 'sharp'

export type PreparedUpload = {
  buffer: Buffer
  contentType: string
  extension: string
}

type PrepareImageOptions = {
  maxBytes: number
  maxDimension: number
  quality?: number
  label: string
}

export const isPdfFile = (file: File) => {
  const lowerName = file.name.toLowerCase()
  return file.type === 'application/pdf' || lowerName.endsWith('.pdf')
}

export const isImageFile = (file: File) => file.type.startsWith('image/')

export const prepareImageUpload = async (
  file: File,
  { maxBytes, maxDimension, quality = 78, label }: PrepareImageOptions
): Promise<PreparedUpload> => {
  if (!isImageFile(file)) {
    throw new Error(`${label} harus berupa gambar.`)
  }
  if (file.size > maxBytes) {
    throw new Error(`${label} terlalu besar. Maksimal ${(maxBytes / (1024 * 1024)).toFixed(1)} MB.`)
  }

  const input = Buffer.from(await file.arrayBuffer())
  if (input.length === 0) {
    throw new Error(`${label} kosong atau gagal dibaca.`)
  }

  try {
    const buffer = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer()

    return {
      buffer,
      contentType: 'image/webp',
      extension: 'webp',
    }
  } catch {
    throw new Error(`${label} gagal diproses. Coba upload gambar JPG/PNG/WebP yang valid.`)
  }
}

export const preparePassthroughUpload = async (
  file: File,
  { maxBytes, contentType, extension, label }: { maxBytes: number; contentType: string; extension: string; label: string }
): Promise<PreparedUpload> => {
  if (file.size > maxBytes) {
    throw new Error(`${label} terlalu besar. Maksimal ${(maxBytes / (1024 * 1024)).toFixed(1)} MB.`)
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) {
    throw new Error(`${label} kosong atau gagal dibaca.`)
  }
  return { buffer, contentType, extension }
}
