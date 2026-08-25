export type InsightCalloutVariant = 'NOTE' | 'IMPORTANT' | 'EXAMPLE'

export type InsightContentBlock =
  | { id: string; type: 'heading'; level: 2 | 3; content: string }
  | { id: string; type: 'paragraph'; content: string }
  | { id: string; type: 'image'; url: string; alt: string }
  | { id: string; type: 'bullet_list' | 'numbered_list'; items: string[] }
  | { id: string; type: 'callout'; variant: InsightCalloutVariant; content: string }
  | { id: string; type: 'table'; headers: string[]; rows: string[][] }
  | { id: string; type: 'quote'; content: string }
  | { id: string; type: 'divider' }

const MAX_BLOCKS = 120
const MAX_TEXT_LENGTH = 12000
const MAX_LIST_ITEMS = 80
const MAX_TABLE_COLUMNS = 12
const MAX_TABLE_ROWS = 80

const text = (value: unknown, max = MAX_TEXT_LENGTH) =>
  typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : ''

const blockId = (value: unknown, index: number) => {
  const candidate = text(value, 120).replace(/[^a-zA-Z0-9_-]/g, '')
  return candidate || `block-${index + 1}`
}

const imageUrl = (value: unknown) => {
  const candidate = text(value, 2000)
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return candidate.startsWith('/') ? candidate : ''
  }
}

export const normalizeInsightBlocks = (value: unknown): InsightContentBlock[] => {
  if (!Array.isArray(value)) return []

  const blocks: InsightContentBlock[] = []
  value.slice(0, MAX_BLOCKS).forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const input = raw as Record<string, unknown>
    const id = blockId(input.id, index)

    if (input.type === 'heading') {
      const content = text(input.content)
      if (content) blocks.push({ id, type: 'heading', level: input.level === 3 ? 3 : 2, content })
      return
    }
    if (input.type === 'paragraph' || input.type === 'quote') {
      const content = text(input.content)
      if (content) blocks.push({ id, type: input.type, content })
      return
    }
    if (input.type === 'image') {
      const url = imageUrl(input.url)
      if (url) blocks.push({ id, type: 'image', url, alt: text(input.alt, 500) })
      return
    }
    if (input.type === 'bullet_list' || input.type === 'numbered_list') {
      const items = Array.isArray(input.items)
        ? input.items.map((item) => text(item, 2000)).filter(Boolean).slice(0, MAX_LIST_ITEMS)
        : []
      if (items.length > 0) blocks.push({ id, type: input.type, items })
      return
    }
    if (input.type === 'callout') {
      const content = text(input.content)
      const variant: InsightCalloutVariant =
        input.variant === 'IMPORTANT' || input.variant === 'EXAMPLE' ? input.variant : 'NOTE'
      if (content) blocks.push({ id, type: 'callout', variant, content })
      return
    }
    if (input.type === 'table') {
      const headers = Array.isArray(input.headers)
        ? input.headers.map((header) => text(header, 1000)).slice(0, MAX_TABLE_COLUMNS)
        : []
      const rows = Array.isArray(input.rows)
        ? input.rows
            .slice(0, MAX_TABLE_ROWS)
            .map((row) =>
              Array.isArray(row)
                ? row.map((cell) => text(cell, 2000)).slice(0, Math.max(headers.length, 1))
                : []
            )
            .filter((row) => row.length > 0)
        : []
      if (headers.length > 0) blocks.push({ id, type: 'table', headers, rows })
      return
    }
    if (input.type === 'divider') blocks.push({ id, type: 'divider' })
  })
  return blocks
}

export const hasInsightBlockContent = (blocks: InsightContentBlock[]) => blocks.some((block) => block.type !== 'divider')

export const insightBlocksToMarkdown = (blocks: InsightContentBlock[]) =>
  blocks
    .map((block) => {
      if (block.type === 'heading') return `${'#'.repeat(block.level)} ${block.content}`
      if (block.type === 'paragraph') return block.content
      if (block.type === 'image') return `![${block.alt}](${block.url})`
      if (block.type === 'bullet_list') return block.items.map((item) => `- ${item}`).join('\n')
      if (block.type === 'numbered_list') return block.items.map((item, index) => `${index + 1}. ${item}`).join('\n')
      if (block.type === 'callout') return `> ${block.content}`
      if (block.type === 'quote') return `> ${block.content}`
      if (block.type === 'divider') return '---'
      if (block.type === 'table') {
        const separator = block.headers.map(() => '---')
        return [block.headers, separator, ...block.rows].map((row) => `| ${row.join(' | ')} |`).join('\n')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
