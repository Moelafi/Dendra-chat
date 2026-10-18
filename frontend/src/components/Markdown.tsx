import { memo, useRef, type ComponentProps } from 'react'
import { FiCheck, FiCopy } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { useCopy } from '../hooks/useCopy'

function CodeBlock({ children, ...props }: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, copy] = useCopy()
  const codeEl = (children as { props?: { className?: string } } | undefined)?.props
  const lang = /language-([\w-]+)/.exec(codeEl?.className ?? '')?.[1] ?? 'text'
  return (
    <div className="not-prose my-4 overflow-hidden rounded-2xl border border-line bg-panel">
      <div
        data-hl-ignore
        className="flex items-center justify-between border-b border-line px-4 py-2 text-xs text-faint select-none"
      >
        <span className="font-mono">{lang}</span>
        <button
          type="button"
          onClick={() => copy(ref.current?.querySelector('code')?.textContent ?? '')}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-surface hover:text-fg"
        >
          {copied ? <FiCheck /> : <FiCopy />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre ref={ref} {...props} className="scrollbar-thin overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  )
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{
        pre: CodeBlock,
        a: (p) => <a {...p} target="_blank" rel="noreferrer" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
})
