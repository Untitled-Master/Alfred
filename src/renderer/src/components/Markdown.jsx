import { memo, useRef, useState, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'
import MermaidBlock from './MermaidBlock'

function CodeShell({ children }) {
  const ref = useRef(null)
  const [copied, setCopied] = useState(false)
  const code = isValidElement(children) ? children : null
  const cn = code?.props?.className || ''
  const lang = (/language-([\w-]+)/.exec(cn)?.[1] || '').replace(/^hljs$/, '')
  const copy = async () => {
    const t = ref.current?.querySelector('code')?.innerText ?? ''
    if (!t) return
    try {
      await navigator.clipboard.writeText(t)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch { /* clipboard unavailable */ }
  }
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span>{lang || 'code'}</span>
        <button onClick={copy} title="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  )
}

const components = {
  pre: ({ children }) => {
    const code = isValidElement(children) ? children : null
    const cn = code?.props?.className || ''
    // Mermaid fences render inline as diagrams (raw-code fallback inside).
    if (/\blanguage-mermaid\b/.test(cn)) return <MermaidBlock>{children}</MermaidBlock>
    return <CodeShell>{children}</CodeShell>
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
  if (plain) return <div className="stream-text">{text}</div>
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
