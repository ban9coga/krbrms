import fs from 'node:fs'
import path from 'node:path'

const inputPath = process.argv[2] ?? 'docs/SOP_ROLE_KRB.md'
const outputPath = process.argv[3] ?? 'docs/SOP_ROLE_KRB.pdf'

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN_LEFT = 50
const MARGIN_TOP = 60
const MARGIN_BOTTOM = 52
const LINE_HEIGHT = 14
const MAX_CHARS = 92

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrapLine(line, maxChars) {
  if (!line) return ['']
  const words = line.split(/\s+/)
  const out = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
    } else {
      if (current) out.push(current)
      if (word.length > maxChars) {
        let rest = word
        while (rest.length > maxChars) {
          out.push(rest.slice(0, maxChars))
          rest = rest.slice(maxChars)
        }
        current = rest
      } else {
        current = word
      }
    }
  }
  if (current) out.push(current)
  return out.length > 0 ? out : ['']
}

function markdownToLines(markdown) {
  const raw = markdown.replace(/\r\n/g, '\n').split('\n')
  const lines = []

  for (const row of raw) {
    const trimmed = row.trim()

    if (trimmed.startsWith('### ')) {
      lines.push(trimmed.slice(4).toUpperCase())
      lines.push('')
      continue
    }
    if (trimmed.startsWith('## ')) {
      lines.push(trimmed.slice(3).toUpperCase())
      lines.push('')
      continue
    }
    if (trimmed.startsWith('# ')) {
      lines.push(trimmed.slice(2).toUpperCase())
      lines.push('')
      continue
    }
    if (trimmed.startsWith('- ')) {
      lines.push(`- ${trimmed.slice(2)}`)
      continue
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      lines.push(trimmed)
      continue
    }

    lines.push(trimmed)
  }

  const wrapped = []
  for (const line of lines) {
    if (!line) {
      wrapped.push('')
      continue
    }
    const chunks = wrapLine(line, MAX_CHARS)
    wrapped.push(...chunks)
  }
  return wrapped
}

function chunkLines(lines, chunkSize) {
  const pages = []
  for (let i = 0; i < lines.length; i += chunkSize) {
    pages.push(lines.slice(i, i + chunkSize))
  }
  return pages.length > 0 ? pages : [['']]
}

function buildContentStream(lines) {
  let stream = 'BT\n/F1 11 Tf\n'
  const startY = PAGE_HEIGHT - MARGIN_TOP
  stream += `${MARGIN_LEFT} ${startY} Td\n`

  lines.forEach((line, idx) => {
    if (idx > 0) {
      stream += `0 -${LINE_HEIGHT} Td\n`
    }
    stream += `(${escapePdfText(line)}) Tj\n`
  })

  stream += 'ET\n'
  return stream
}

function buildPdf(pagesLines) {
  const objects = []

  const pageObjectIds = []
  const contentObjectIds = []

  for (let i = 0; i < pagesLines.length; i++) {
    const pageId = 4 + i * 2
    const contentId = pageId + 1
    pageObjectIds.push(pageId)
    contentObjectIds.push(contentId)
  }

  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ')
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [ ${kids} ] /Count ${pagesLines.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  for (let i = 0; i < pagesLines.length; i++) {
    const pageId = pageObjectIds[i]
    const contentId = contentObjectIds[i]
    const contentStream = buildContentStream(pagesLines[i])
    const byteLen = Buffer.byteLength(contentStream, 'binary')

    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    objects[contentId] = `<< /Length ${byteLen} >>\nstream\n${contentStream}endstream`
  }

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  const maxId = objects.length - 1

  for (let id = 1; id <= maxId; id++) {
    const body = objects[id] ?? ''
    offsets[id] = Buffer.byteLength(pdf, 'binary')
    pdf += `${id} 0 obj\n${body}\nendobj\n`
  }

  const xrefStart = Buffer.byteLength(pdf, 'binary')
  pdf += `xref\n0 ${maxId + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let id = 1; id <= maxId; id++) {
    const off = String(offsets[id] ?? 0).padStart(10, '0')
    pdf += `${off} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(pdf, 'binary')
}

function main() {
  const md = fs.readFileSync(inputPath, 'utf8')
  const lines = markdownToLines(md)
  const linesPerPage = Math.floor((PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) / LINE_HEIGHT)
  const pages = chunkLines(lines, linesPerPage)
  const pdf = buildPdf(pages)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, pdf)
  console.log(`PDF generated: ${outputPath}`)
}

main()
