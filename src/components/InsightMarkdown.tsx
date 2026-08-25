import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function InsightMarkdown({ content }: { content: string }) {
  return (
    <div className="insight-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noreferrer' : undefined}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
