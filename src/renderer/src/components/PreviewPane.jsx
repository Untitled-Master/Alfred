import { useEffect, useState } from 'react'
import { FileText, X } from 'lucide-react'
import Markdown from './Markdown'

const IMG_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
const MD_EXTS = ['md', 'markdown']
const TEXT_EXTS = ['txt', 'md', 'markdown', 'js', 'jsx', 'ts', 'tsx', 'json', 'css', 'html', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'yml', 'yaml', 'toml', 'csv', 'log', 'sql', 'xml']

const extOf = (name = '') => String(name.split('.').pop() || '').toLowerCase()
const b64ToText = (b64) => {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
  } catch {
    return ''
  }
}

// Right-side preview for a sent attachment: images, PDFs, markdown,
// code/text, with a safe fallback for anything else.
export default function PreviewPane({ att, onClose }) {
  const [remote, setRemote] = useState(null) // { mime, base64, size } for workspace refs
  const [err, setErr] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!att || att.kind !== 'ref') return
    setRemote(null)
    setErr('')
    let live = true
    window.api.opencode
      .readWorkspaceFile(att.path)
      .then((r) => {
        if (live) setRemote(r)
      })
      .catch((e) => {
        if (live) setErr(e.message || 'Could not read file.')
      })
    return () => {
      live = false
    }
  }, [att])

  if (!att) return null
  const name = att.name || att.path || 'attachment'
  const ext = extOf(att.kind === 'ref' ? att.path : name)
  const isImg = att.kind === 'image' || IMG_EXTS.includes(ext)
  const isPdf = att.kind === 'pdf' || ext === 'pdf'
  const isMd = MD_EXTS.includes(ext)
  const isText = att.kind === 'text' || TEXT_EXTS.includes(ext)

  let body = null
  if (isImg) {
    const src = att.kind === 'image' ? att.url : remote ? `data:${remote.mime};base64,${remote.base64}` : null
    body = src ? (
      <img src={src} alt={name} className="preview-img" />
    ) : err ? (
      <div className="preview-err">{err}</div>
    ) : (
      <div className="preview-loading">Loading…</div>
    )
  } else if (isPdf) {
    const src = att.kind === 'pdf' && att.url ? att.url : remote ? `data:application/pdf;base64,${remote.base64}` : null
    body = src ? (
      <embed src={src} type="application/pdf" className="preview-pdf" />
    ) : err ? (
      <div className="preview-err">{err}</div>
    ) : (
      <div className="preview-loading">Loading…</div>
    )
  } else if (isMd || isText) {
    const raw = att.kind === 'text' ? att.text || '' : remote ? b64ToText(remote.base64) : null
    if (raw === null || raw === undefined) {
      body = err ? <div className="preview-err">{err}</div> : <div className="preview-loading">Loading…</div>
    } else if (isMd) {
      body = <Markdown text={raw.slice(0, 60000)} />
    } else {
      body = (
        <pre className="preview-code">
          <code>{raw.slice(0, 60000)}</code>
        </pre>
      )
    }
  } else {
    body = (
      <div className="preview-fallback">
        <FileText size={28} />
        <div>{name}</div>
        <span>No inline preview for .{ext || '?'} files yet.</span>
      </div>
    )
  }

  return (
    <aside className="preview-pane">
      <div className="preview-head">
        <span className="preview-title" title={att.kind === 'ref' ? att.path : name}>
          {name}
        </span>
        <button className="icon-btn" onClick={onClose} title="Close preview">
          <X size={14} />
        </button>
      </div>
      <div className="preview-body">{body}</div>
    </aside>
  )
}
