import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { StandardFonts, type PDFDocument, type PDFFont } from 'pdf-lib'
import type { CertificateFont } from './certificateLayout'

const fontFiles = {
  MONTSERRAT_REGULAR: 'Montserrat-Regular.ttf',
  MONTSERRAT_EXTRA_BOLD: 'Montserrat-ExtraBold.ttf',
  ANTON: 'Anton-Regular.ttf',
} as const

const embeddedFontBytes = new Map<string, Promise<Uint8Array>>()

const loadFontBytes = (fileName: string) => {
  const cached = embeddedFontBytes.get(fileName)
  if (cached) return cached
  const bytes = readFile(path.join(process.cwd(), 'public', 'fonts', 'certificates', fileName))
  embeddedFontBytes.set(fileName, bytes)
  return bytes
}

export const embedCertificateFonts = async (pdf: PDFDocument): Promise<Record<CertificateFont, PDFFont>> => {
  pdf.registerFontkit(fontkit)
  const [montserratRegular, montserratExtraBold, anton] = await Promise.all([
    loadFontBytes(fontFiles.MONTSERRAT_REGULAR),
    loadFontBytes(fontFiles.MONTSERRAT_EXTRA_BOLD),
    loadFontBytes(fontFiles.ANTON),
  ])

  return {
    MONTSERRAT_REGULAR: await pdf.embedFont(montserratRegular),
    MONTSERRAT_EXTRA_BOLD: await pdf.embedFont(montserratExtraBold),
    ANTON: await pdf.embedFont(anton),
    MONO: await pdf.embedFont(StandardFonts.CourierBold),
  }
}
