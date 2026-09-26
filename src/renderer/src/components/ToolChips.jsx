import { useState } from 'react'
import {
  Brain, ChevronDown, FileSearch, Globe, List, ListTodo,
  MessagesSquare, Pencil, Search, SquareTerminal, Wrench
} from 'lucide-react'
import CodeBlock from './CodeBlock'

/* ─────────────────────────────────────────────────────────
 * TOOL CHIPS — an agent run as compact rows: tool calls with
 * inline chips. Hover a row to reveal its chevron; every row
 * expands for tool/status/input/output. `write`/`edit` rows
 * always show their content in a CodeBlock below the row
 * (full content for writes, old->new diff for edits).
 * ───────────────────────────────────────────────────────── */

const ICONS = {
  read: FileSearch,
  write: Pencil,
  list: List,
  cmd: SquareTerminal,
  todo: ListTodo,
  ask: MessagesSquare,
  web: Globe,
  memory: Brain,
  search: Search,
  other: Wrench
}

const BADGE = {
  read: 'READ', write: 'WRITE', list: 'LIST', cmd: 'CMD', todo: 'TODO',
  ask: 'ASK', web: 'WEB', memory: 'MEMORY', search: 'SEARCH', other: 'TOOL'
}

const basename = (p) => String(p || '').split(/[\\/]/).pop() || ''

// Tool args arrive as an object (or a JSON string mid-stream). Anything else
// means the input hasn't streamed in yet — the caller falls back to generic.
function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object') return v
    } catch { /* partial JSON mid-stream */ }
  }
  return null
}

const splitWords = (s) => String(s).split(/(\s+)/).filter((x) => x.length > 0)

// Word-level change pieces between two paired lines: shared prefix/suffix
// stay plain, the middle is marked add/del.
function pairPieces(aLine, bLine) {
  const a = splitWords(aLine)
  const b = splitWords(bLine)
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const parts = (toks, change) => {
    const out = []
    const join = (t) => t.join('')
    if (pre > 0) out.push({ text: join(toks.slice(0, pre)) })
    const mid = join(toks.slice(pre, toks.length - suf))
    if (mid) out.push(change ? { text: mid, change } : { text: mid })
    if (suf > 0) out.push({ text: join(toks.slice(toks.length - suf)) })
    if (!out.length) out.push({ text: join(toks) })
    return out
  }
  return { del: parts(a, 'del'), add: parts(b, 'add') }
}

// Line diff (old -> new) as { old, cur, type, pieces } rows, hunk-relative
// numbering. Oversized inputs degrade to a whole-block replace; rows cap.
function buildDiff(oldText, newText) {
  const a = String(oldText ?? '').split('\n')
  const b = String(newText ?? '').split('\n')
  if (a.length * b.length > 120000 || a.length + b.length > 1200) {
    return [
      ...a.map((t, i) => ({ old: i + 1, cur: null, type: 'del', pieces: [{ text: t }] })),
      ...b.map((t, i) => ({ old: null, cur: i + 1, type: 'add', pieces: [{ text: t }] }))
    ]
  }
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: 'ctx', a: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ t: 'del', a: a[i++] })
    } else {
      ops.push({ t: 'add', b: b[j++] })
    }
  }
  while (i < n) ops.push({ t: 'del', a: a[i++] })
  while (j < m) ops.push({ t: 'add', b: b[j++] })
  const rows = []
  let old = 1
  let cur = 1
  for (let k = 0; k < ops.length && rows.length < 400; k++) {
    const o = ops[k]
    if (o.t === 'ctx') {
      rows.push({ old, cur, type: 'ctx', pieces: [{ text: o.a }] })
      old++
      cur++
      continue
    }
    const dels = []
    const adds = []
    while (k < ops.length && ops[k].t !== 'ctx' && rows.length < 400) {
      if (ops[k].t === 'del') dels.push(ops[k].a)
      else adds.push(ops[k].b)
      k++
    }
    k--
    const paired = Math.min(dels.length, adds.length)
    for (let p = 0; p < paired && rows.length < 400; p++) {
      const { del, add } = pairPieces(dels[p], adds[p])
      rows.push({ old, cur: null, type: 'del', pieces: del })
      old++
      rows.push({ old: null, cur, type: 'add', pieces: add })
      cur++
    }
    for (let p = paired; p < dels.length && rows.length < 400; p++) {
      rows.push({ old, cur: null, type: 'del', pieces: [{ text: dels[p] }] })
      old++
    }
    for (let p = paired; p < adds.length && rows.length < 400; p++) {
      rows.push({ old: null, cur, type: 'add', pieces: [{ text: adds[p] }] })
      cur++
    }
  }
  return rows
}

// What the model is writing: filename + full content (write) or an
// old->new diff (edit). Null when the args haven't streamed in yet.
function fileView({ tool, rawInput, label }) {
  const args = parseArgs(rawInput)
  if (!args) return null
  const t = String(tool || '').toLowerCase()
  const filePath = args.filePath || args.path || ''
  const name = basename(filePath) || basename(label)
  if (t === 'write' || typeof args.content === 'string') {
    return { filename: name || 'new file', code: args.content ?? '', diff: null }
  }
  if (t === 'edit' || typeof args.oldString === 'string' || typeof args.newString === 'string') {
    const oldS = typeof args.oldString === 'string' ? args.oldString : ''
    const newS = typeof args.newString === 'string' ? args.newString : ''
    if (!oldS && !newS) return null
    return { filename: name || 'edit', code: newS, diff: buildDiff(oldS, newS) }
  }
  return null
}

export default function ToolChips({ label, done, status, tool, action = 'other', input, output, rawInput }) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!(tool || status || input || output)
  const Icon = ICONS[action] || Wrench
  const fv = action === 'write' ? fileView({ tool, rawInput, label }) : null
  const showCode = !!fv

  return (
    <div className="tchip">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => (hasDetail ? setOpen((o) => !o) : undefined)}
        className={`tchip-row${done ? ' done' : ''}`}
        title={hasDetail ? 'Toggle details' : label}
      >
        {!done && (
          <span className="tool-dots" title="Running" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
        <span className={`tchip-ico ${action}`}>
          <Icon size={13} className="tchip-tool-ico" />
          <ChevronDown size={12} className={`tchip-chev${open ? ' open' : ''}`} />
        </span>
        <span className={`tool-badge ${action}`}>{BADGE[action] || 'TOOL'}</span>
        <span className="tchip-chip" title={label}>{label}</span>
      </button>

      {showCode && (
        <div className="tchip-code">
          <CodeBlock
            filename={fv.filename}
            code={fv.code}
            diff={fv.diff}
            variant={fv.diff ? 'Diff' : 'Code'}
            previewLines={fv.diff ? undefined : 12}
          />
        </div>
      )}

      <div
        className="tchip-detail-grid"
        style={{ gridTemplateRows: open && hasDetail ? '1fr' : '0fr', opacity: open && hasDetail ? 1 : 0 }}
      >
        <div className="tchip-detail-clip">
          <div className="tool-detail">
            {tool && (
              <div className="td-row"><span>Tool</span><code>{tool}</code></div>
            )}
            {status && (
              <div className="td-row"><span>Status</span><code>{status}</code></div>
            )}
            {input ? (
              <div className="td-block"><span>Input</span><pre>{input}</pre></div>
            ) : null}
            {output ? (
              <div className="td-block"><span>Output</span><pre>{output}</pre></div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
