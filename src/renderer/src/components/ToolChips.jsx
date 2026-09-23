import { useState } from 'react'
import {
  Brain, ChevronDown, FileSearch, Globe, List, ListTodo,
  MessagesSquare, Pencil, Search, SquareTerminal, Wrench
} from 'lucide-react'
import CodeBlock from './CodeBlock'

/* ─────────────────────────────────────────────────────────
 * TOOL CHIPS — an agent run as compact rows: tool calls with
 * inline chips. Hover a row to reveal its chevron; every row
 * expands to show what the tool actually did. `write`/`edit`
 * rows render their content in a CodeBlock.
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

export default function ToolChips({ label, done, status, tool, action = 'other', input, output }) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!(tool || status || input || output)
  const Icon = ICONS[action] || Wrench
  const showCode = (action === 'write') && (output || input)

  return (
    <div className="tchip">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => (hasDetail ? setOpen((o) => !o) : undefined)}
        className={`tchip-row${done ? ' done' : ''}`}
        title={hasDetail ? 'Toggle details' : label}
      >
        <span className="tchip-ico">
          <Icon size={13} className="tchip-tool-ico" />
          <ChevronDown size={12} className={`tchip-chev${open ? ' open' : ''}`} />
        </span>
        <span className={`tool-badge ${action}`}>{BADGE[action] || 'TOOL'}</span>
        <span className="tchip-chip" title={label}>{label}</span>
        {!done && <span className="tool-live">running</span>}
      </button>

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
            {showCode ? (
              <CodeBlock filename={label} code={String(output || input)} previewLines={12} />
            ) : (
              <>
                {input ? (
                  <div className="td-block"><span>Input</span><pre>{input}</pre></div>
                ) : null}
                {output ? (
                  <div className="td-block"><span>Output</span><pre>{output}</pre></div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
