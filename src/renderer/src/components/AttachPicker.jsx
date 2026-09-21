import { useEffect, useState } from 'react'
import { Check, FileText, Search, Upload } from 'lucide-react'

const SKIP = ['node_modules', '.git', '/out/', '/dist/', '/build/', '\\out\\', '\\dist\\', '\\build\\']

// OpenCode-style attach: search workspace files by reference (nothing
// uploaded — the server reads them), plus an OS upload row for images/text.
export default function AttachPicker({ wrapRef, open, staged, onToggle, onUpload, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (open) setQ('')
  }, [open ])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        const r = (await window.api.opencode.findFiles(q)) || []
        setResults(
          r
            .filter(
              (p) =>
                typeof p === 'string' &&
                !p.endsWith('/') &&
                !p.endsWith('\\') &&
                !SKIP.some((s) => p.includes(s))
            )
            .slice(0, 30)
        )
      } catch {
        setResults([])
      }
    }, 200)
    return () => clearTimeout(t)
  }, [q, open ])

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (!wrapRef.current?.contains(e.target)) onClose()
    }
    const esc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open, onClose, wrapRef])

  if (!open) return null
  return (
    <div className="attach-pop popover">
      <div className="attach-search">
        <Search size={13} />
        <input autoFocus placeholder="Search workspace files…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="attach-results">
        {results.map((p) => {
          const on = staged.some((a) => a.kind === 'ref' && a.path === p)
          return (
            <div key={p} className={`attach-row-item${on ? ' on' : ''}`} onClick={() => onToggle(p)} title={p}>
              <FileText size={13} />
              <span className="attach-path">{p}</span>
              {on && <Check size={13} className="staged-check" />}
            </div>
          )
        })}
        {!results.length && <div className="attach-empty">{q ? 'No files match.' : 'Type to search the workspace.'}</div>}
      </div>
      <div className="attach-upload" onClick={onUpload}>
        <Upload size={13} /> Upload from PC…
      </div>
    </div>
  )
}
