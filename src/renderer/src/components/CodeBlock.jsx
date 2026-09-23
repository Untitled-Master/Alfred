import { useCallback, useState } from 'react'
import { Check, Copy, FileCode2 } from 'lucide-react'

/* ─────────────────────────────────────────────────────────
 * CODE BLOCK — glass editor panel with two views:
 *   · Code — line-numbered listing with light syntax coloring
 *   · Diff — unified diff: single gutter, green/red row tint
 *     + accent bar, word-level add/del highlights
 * Used for markdown fences and for `write`/`edit` tool output.
 * ───────────────────────────────────────────────────────── */

// One run of code inside a diff row; `change` tints it as add/del.
function Pieces({ pieces }) {
  return (
    <>
      {pieces.map((p, i) => {
        if (p.change) {
          const add = p.change === 'add'
          return (
            <span key={i} className={`cb-word ${add ? 'add' : 'del'}`}>
              {highlight(p.text)}
            </span>
          )
        }
        return <span key={i}>{highlight(p.text)}</span>
      })}
    </>
  )
}

const KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'async', 'function', 'const', 'let', 'var',
  'await', 'return', 'if', 'else', 'for', 'while', 'new', 'throw', 'try', 'catch',
  'null', 'true', 'false', 'undefined'
])
const TOKEN =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b(?:import|from|export|default|async|function|const|let|var|await|return|if|else|for|while|new|throw|try|catch|null|true|false|undefined)\b|[A-Za-z_$][\w$]*(?=\s*\())/g

function highlight(text) {
  const nodes = []
  let last = 0
  let k = 0
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0
    const t = m[0]
    if (idx > last) nodes.push(<span key={k++}>{text.slice(last, idx)}</span>)
    let cls = 'cb-tok-fn'
    if (/^["'`]/.test(t) || /^\d/.test(t)) cls = 'cb-tok-str'
    else if (KEYWORDS.has(t)) cls = 'cb-tok-kw'
    nodes.push(
      <span key={k++} className={cls}>
        {t}
      </span>
    )
    last = idx + t.length
  }
  if (last < text.length) nodes.push(<span key={k++}>{text.slice(last)}</span>)
  return nodes
}

export default function CodeBlock({
  variant = 'Code',
  lines,
  code,
  diff,
  filename = 'code',
  lang = '',
  /** when the listing exceeds this many lines, show a preview with an
   *  expand toggle instead of the full text (used for tool-write output) */
  previewLines,
  onCopy
}) {
  const resolvedLines = lines ?? (code != null ? String(code).split('\n') : [])
  const [view, setView] = useState(variant)
  const isDiff = view === 'Diff' && Array.isArray(diff) && diff.length > 0
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const raw = code ?? resolvedLines.join('\n')

  const copy = useCallback(() => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true)
      onCopy?.(raw)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [raw, onCopy])

  const added = Array.isArray(diff) ? diff.filter((r) => r.type === 'add').length : 0
  const removed = Array.isArray(diff) ? diff.filter((r) => r.type === 'del').length : 0
  const canDiff = Array.isArray(diff) && diff.length > 0
  const collapsible =
    !isDiff && typeof previewLines === 'number' && resolvedLines.length > previewLines
  const visibleLines = collapsible && !expanded ? resolvedLines.slice(0, previewLines) : resolvedLines

  return (
    <div className="codeblock v2">
      <div className="codeblock-bar">
        <span className="cb-file">
          <FileCode2 size={14} />
          <span className="cb-name">{filename || lang || 'code'}</span>
        </span>
        {canDiff && (
          <span className="seg cb-toggle">
            {['Code', 'Diff'].map((v) => (
              <button key={v} className={`seg-btn${view === v ? ' on' : ''}`} onClick={() => setView(v)}>
                {v}
              </button>
            ))}
          </span>
        )}
        {isDiff ? (
          <span className="cb-stat">
            <span className="cb-add">+{added}</span>
            <span className="cb-del">-{removed}</span>
          </span>
        ) : (
          <button type="button" aria-label="Copy code" onClick={copy} className={`cb-copy${copied ? ' ok' : ''}`}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      <div className="cb-body">
        {isDiff ? (
          <div className="cb-diff">
            {diff.map((r, i) => {
              const add = r.type === 'add'
              const del = r.type === 'del'
              const num = del ? r.old : r.cur
              return (
                <div key={i} className={`cb-row${add ? ' add' : del ? ' del' : ''}`}>
                  {(add || del) && <span className={`cb-bar${add ? ' add' : ' del'}`} />}
                  <span className={`cb-gutter${add ? ' add' : del ? ' del' : ''}`}>{num ?? ''}</span>
                  <code className="cb-code">
                    <Pieces pieces={r.pieces} />
                  </code>
                </div>
              )
            })}
          </div>
        ) : (
          <div className={`cb-listing${collapsible && !expanded ? ' preview' : ''}`}>
            {visibleLines.map((line, i) => (
              <div key={i} className="cb-row">
                <span className="cb-gutter">{i + 1}</span>
                <code className="cb-code">{highlight(line || ' ')}</code>
              </div>
            ))}
          </div>
        )}
        {collapsible && (
          <button type="button" className="cb-expand" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Show less' : `Show all ${resolvedLines.length} lines`}
          </button>
        )}
      </div>
    </div>
  )
}
