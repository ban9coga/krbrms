import type { InsightContentBlock } from '../lib/insightBlocks'

const calloutLabels = {
  NOTE: 'Catatan',
  IMPORTANT: 'Penting',
  EXAMPLE: 'Contoh',
} as const

export default function InsightBlocks({ blocks }: { blocks: InsightContentBlock[] }) {
  return (
    <div className="insight-blocks">
      {blocks.map((block) => {
        if (block.type === 'heading') {
          const Heading = block.level === 3 ? 'h3' : 'h2'
          return <Heading key={block.id}>{block.content}</Heading>
        }
        if (block.type === 'paragraph') return <p key={block.id}>{block.content}</p>
        if (block.type === 'image') {
          return (
            <figure key={block.id} className="insight-block-image">
              <img src={block.url} alt={block.alt || ''} loading="lazy" />
              {block.alt ? <figcaption>{block.alt}</figcaption> : null}
            </figure>
          )
        }
        if (block.type === 'bullet_list') {
          return (
            <ul key={block.id}>
              {block.items.map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>)}
            </ul>
          )
        }
        if (block.type === 'numbered_list') {
          return (
            <ol key={block.id}>
              {block.items.map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>)}
            </ol>
          )
        }
        if (block.type === 'callout') {
          return (
            <aside key={block.id} className={`insight-block-callout insight-block-callout-${block.variant.toLowerCase()}`}>
              <strong>{calloutLabels[block.variant]}</strong>
              <p>{block.content}</p>
            </aside>
          )
        }
        if (block.type === 'quote') return <blockquote key={block.id}>{block.content}</blockquote>
        if (block.type === 'divider') return <hr key={block.id} />
        if (block.type === 'table') {
          return (
            <div key={block.id} className="insight-block-table-wrap" role="region" aria-label="Tabel artikel" tabIndex={0}>
              <table>
                <thead>
                  <tr>{block.headers.map((header, index) => <th key={`${block.id}-h-${index}`}>{header}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${block.id}-r-${rowIndex}`}>
                      {block.headers.map((_, cellIndex) => <td key={`${block.id}-${rowIndex}-${cellIndex}`}>{row[cellIndex] ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
