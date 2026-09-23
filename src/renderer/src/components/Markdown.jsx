import { memo, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import MermaidBlock from './MermaidBlock'
import CodeBlock from './CodeBlock'
import StreamingText from './StreamingText'

function flatText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatText).join('')
  if (isValidElement(node)) return flatText(node.props?.children)
  return ''
}

const components = {
  pre: ({ children }) => {
    const code = isValidElement(children) ? children : null
    const cn = code?.props?.className || ''
    // Mermaid fences render inline as diagrams (raw-code fallback inside).
    if (/\blanguage-mermaid\b/.test(cn)) return <MermaidBlock>{children}</MermaidBlock>
    const lang = (/language-([\w-]+)/.exec(cn)?.[1] || '').replace(/^hljs$/, '')
    const raw = flatText(code?.props?.children).replace(/\n$/, '')
    return <CodeBlock filename={lang || 'code'} lang={lang} code={raw} />
  },
  code: ({ className, children, ...rest }) => {
    // Fenced blocks carry language-* (highlighted by rehype-highlight);
    // bare backticks stay our accent chip.
    if (/language-/.test(className || '')) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      )
    }
    return (
      <code className="chip" {...rest}>
        {children}
      </code>
    )
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="table-scroll">
      <table>{children}</table>
    </div>
  ),
  img: ({ src, alt }) => <img src={src} alt={alt} loading="lazy" />
}

// Memoized: streaming re-renders every token, but identical text skips parsing.
// While live, render plain pre-wrapped text (no remark/rehype pass at all) so
// long replies stream at token speed; full formatting applies the moment the
// turn goes idle.
export default memo(function Markdown({ text, plain }) {
  if (plain) return <StreamingText text={text} done={false} />
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
