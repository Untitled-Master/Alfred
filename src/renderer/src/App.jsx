import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Columns2,
  Copy,
  FileText,
  Folder,
  GitBranch,
  MessagesSquare,
  Monitor,
  Music,
  Paperclip,
  Pencil,
  Pin,
  Play,
  Plus,
  Search,
  Settings as SettingsIcon,
  Square,
  SquareTerminal,
  Trash2,
  X
} from 'lucide-react'
import Navbar, { HeroChrome } from './components/Navbar'
import AttachPicker from './components/AttachPicker'
import PreviewPane from './components/PreviewPane'
import Settings from './components/Settings'
import Dropdown from './components/Dropdown'
import Markdown from './components/Markdown'
import LoadingState from './components/LoadingState'
import ToolChips from './components/ToolChips'
import ApprovalCard from './components/ApprovalCard'
import GitPanel from './components/GitPanel'
import { useUpdater } from './updates/useUpdater'
import { useOpencode, modelKey } from './opencode/useOpencode'
import { useTheme } from './theme/ThemeContext'

const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'webm']
const audioExtOf = (name = '') => String(name.split('.').pop() || '').toLowerCase()
const isAudioAtt = (a) =>
  !!a &&
  (a.kind === 'audio' ||
    (a.kind === 'ref' && AUDIO_EXTS.includes(audioExtOf(a.path || a.name || ''))))

// Inline audio player for audio attachments in chat: native controls handle
// play/pause/seek, plus Stop (pause + rewind) and Close (collapse to a chip,
// click to reopen). Workspace refs resolve their bytes through the backend.
function AudioWidget({ a }) {
  const [open, setOpen] = useState(true)
  const [src, setSrc] = useState(a.url || null)
  const [err, setErr] = useState('')
  const audioRef = useRef(null)

  useEffect(() => {
    if (a.url) {
      setSrc(a.url)
      return
    }
    if (a.kind !== 'ref') {
      setErr('No playable audio.')
      return
    }
    let live = true
    setSrc(null)
    setErr('')
    window.api.opencode
      .readWorkspaceFile(a.path)
      .then((r) => {
        if (live) setSrc(`data:${r.mime || 'audio/mpeg'};base64,${r.base64}`)
      })
      .catch((e) => {
        if (live) setErr(e.message || 'Could not read file.')
      })
    return () => {
      live = false
    }
  }, [a])

  const stop = () => {
    const el = audioRef.current
    if (el) {
      el.pause()
      try {
        el.currentTime = 0
      } catch {
        /* not loaded yet */
      }
    }
  }
  const close = () => {
    stop()
    setOpen(false)
  }

  if (!open) {
    return (
      <span
        className="msg-att clickable"
        title={`${a.name} — click to reopen player`}
        onClick={() => setOpen(true)}
      >
        <Play size={11} /> {a.name}
      </span>
    )
  }
  return (
    <span className="audio-widget">
      <span className="audio-title" title={a.kind === 'ref' ? a.path : a.name}>
        <Music size={12} /> {a.name}
      </span>
      {src ? (
        <audio ref={audioRef} className="audio-el" controls src={src} preload="metadata" />
      ) : err ? (
        <span className="audio-err">{err}</span>
      ) : (
        <span className="audio-loading">Loading audio…</span>
      )}
      <span className="audio-btns">
        <button className="icon-btn" onClick={stop} title="Stop">
          <Square size={11} />
        </button>
        <button className="icon-btn" onClick={close} title="Close player">
          <X size={12} />
        </button>
      </span>
    </span>
  )
}

// Thread tint palette (group header wash + folder icon). Alpha-mixed at the
// call site so one set works in both appearances.
const WS_COLORS = {
  red: '#f87171',
  orange: '#fb923c',
  amber: '#facc15',
  green: '#34d399',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  pink: '#f472b6',
  purple: '#c084fc'
}

const timeNow = () =>
  new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })

// Sidebar subtitle for server sessions: folder + relative update time.
const timeAgo = (ts) => {
  if (!ts) return ''
  const d = Date.now() - ts
  if (d < 0) return ''
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const sessSubtitle = (s) => {
  const folder = (s.directory || '').split(/[\\/]/).filter(Boolean).pop() || ''
  const ago = timeAgo(s.time?.updated || s.time?.created)
  return [folder, ago].filter(Boolean).join(' · ')
}
const fmtTs = (ts) =>
  ts
    ? new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : ''
// Compact token counts for the context readout: 12400 -> 12.4k.
const fmtTok = (n) => {
  if (typeof n !== 'number' || !(n >= 0)) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

const TOOL_ACTION = {
  read: 'read',
  task: 'read',
  write: 'write',
  edit: 'write',
  glob: 'list',
  grep: 'list',
  list: 'list',
  ls: 'list',
  bash: 'cmd',
  shell: 'cmd',
  sh: 'cmd',
  terminal: 'cmd',
  todo: 'todo',
  todowrite: 'todo',
  question: 'ask',
  webfetch: 'web',
  websearch: 'web'
}
// Our MCP servers arrive namespaced (server_tool): give them their own badges.
const mcpAction = (toolName) => {
  if (toolName.startsWith('albert-student-memory_')) return 'memory'
  if (toolName.startsWith('albert-course-search_')) return 'search'
  return null
}

function Msg({ m, onPreview, live, onQuestion, qReq }) {
  if (m.kind === 'perm') return null // legacy cards from the approval-card era
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }
  if (m.role === 'user') {
    return (
      <>
        <div className="msg-user" id={m.id ? `msg-${m.id}` : undefined}>
          {m.text}
        </div>
        {m.attachments?.length > 0 && (
          <div className="msg-atts">
            {m.attachments.map((a, i) =>
              isAudioAtt(a) ? (
                <AudioWidget key={a.id || i} a={a} />
              ) : (
                <span
                  key={a.id || i}
                  className="msg-att clickable"
                  title={`${a.kind === 'ref' ? a.path : a.name} — click to preview`}
                  onClick={() => onPreview?.(a)}
                >
                  {a.kind === 'image' ? <img src={a.url} alt="" /> : <FileText size={11} />}
                  {a.name}
                </span>
              )
            )}
          </div>
        )}
      </>
    )
  }
  // Live placeholder before the first streamed part: render nothing so the
  // working indicator is the only visible state.
  if (!m.text && !(m.tools || []).length) return null
  // Chronological blocks (text + tool calls interleaved as they happened).
  // Legacy messages only carry tools/text: fall back to the old tools-first order.
  const blocks =
    Array.isArray(m.blocks) && m.blocks.length
      ? m.blocks
      : [
          ...(m.tools || []).map((t, i) =>
            typeof t === 'string'
              ? { kind: 'tool', key: `t${i}`, label: t }
              : { kind: 'tool', key: t.callID || `t${i}`, ...t }
          ),
          ...(m.text ? [{ kind: 'text', key: 'text', text: m.text }] : [])
        ]
  let lastTextIdx = -1
  blocks.forEach((b, i) => {
    if (b.kind === 'text') lastTextIdx = i
  })
  const renderBlock = (b, i) => {
    if (b.kind !== 'tool')
      return <Markdown key={b.key || i} text={b.text} plain={live && i === lastTextIdx} />
    if (b.tool === 'question' && Array.isArray(b.questions) && b.questions.length) {
      return (
        <ApprovalCard
          key={b.callID || b.key || i}
          tool={b}
          requestID={qReq[b.callID]}
          onAnswer={(answers) => onQuestion(qReq[b.callID], answers)}
        />
      )
    }
    return (
      <ToolChips
        key={b.key || i}
        label={b.label}
        done={b.done}
        status={b.status}
        tool={b.tool}
        action={b.action}
        input={b.input}
        output={b.output}
        rawInput={b.rawInput}
      />
    )
  }
  return (
    <div className="msg-ai" id={m.id ? `msg-${m.id}` : undefined}>
      {m.reasoning ? (
        <details className="thinking" open={live || undefined}>
          <summary>{live ? 'Thinking…' : 'Thinking'}</summary>
          <div className="thinking-body">{m.reasoning}</div>
        </details>
      ) : null}
      {blocks.map(renderBlock)}
      <div className="msg-meta">
        <span>{m.time || timeNow()}</span>
        <button className="copy-btn" onClick={copy} title="Copy">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  )
}

function WorkspacePicker({
  effDir,
  history,
  onPick,
  onBrowse,
  direction = 'down',
  align = 'right',
  title
}) {
  const base = (d) => d.split(/[\\/]/).filter(Boolean).pop() || d
  const seen = [...new Set([effDir, ...history].filter(Boolean))]
  return (
    <span className="ws-pick" title={title}>
      <Folder size={15} className="ws-pick-ico" strokeWidth={1.8} />
      <Dropdown
        className="ws-dd"
        align={align}
        direction={direction}
        searchPlaceholder={seen.length > 4 ? 'Search workspaces…' : ''}
        value={effDir}
        onChange={(v) => (v === '__browse__' ? onBrowse() : onPick(v))}
        options={[
          { header: 'Workspaces' },
          ...seen.map((d) => ({ value: d, label: base(d), hint: d })),
          { header: 'Open' },
          {
            value: '__browse__',
            label: 'Open from file explorer…',
            hint: 'Pick a folder as workspace'
          }
        ]}
      />
    </span>
  )
}

// "New" menu: new session in the current workspace, or open a folder as a
// workspace (existing sessions for that folder surface automatically).
function NewMenu({ onNewSession, onNewWorkspace, variant = 'nav' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    const esc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const pick = (fn) => {
    setOpen(false)
    fn()
  }
  return (
    <div className={`new-menu ${variant}`} ref={ref}>
      <button
        type="button"
        className={
          variant === 'side'
            ? `btn ghost hoverable wide${open ? ' on' : ''}`
            : `nbtn new-btn${open ? ' on' : ''}`
        }
        title="New session or workspace (Ctrl+N / Ctrl+D)"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {variant === 'side' ? (
          <>
            + New <ChevronDown size={12} className={`dd-chev${open ? ' up' : ''}`} />
          </>
        ) : (
          <>
            <Plus size={14} strokeWidth={1.8} />
            <span>New</span>
            <ChevronDown size={12} className={`dd-chev${open ? ' up' : ''}`} />
          </>
        )}
      </button>
      {open && (
        <div className={`dd-pop popover left new-pop`} role="menu">
          <div className="dd-item" role="menuitem" onClick={() => pick(onNewSession)}>
            <span className="new-opt">
              <MessagesSquare size={15} />
              <span className="new-opt-text">
                <strong>New session</strong>
                <em>Start a thread in the current workspace</em>
              </span>
              <span className="new-kbd">Ctrl+N</span>
            </span>
          </div>
          <div className="dd-item" role="menuitem" onClick={() => pick(onNewWorkspace)}>
            <span className="new-opt">
              <Folder size={15} />
              <span className="new-opt-text">
                <strong>New workspace</strong>
                <em>Open a folder — existing sessions load in the sidebar</em>
              </span>
              <span className="new-kbd">Ctrl+D</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function AttachChips({ pending, removePending }) {
  if (!pending.length) return null
  const kb = (n) =>
    n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`
  return (
    <div className="attach-row">
      {pending.map((a) => (
        <div key={a.id} className="attach-chip" title={a.name}>
          {a.kind === 'image' ? (
            <img src={a.url} alt="" />
          ) : isAudioAtt(a) ? (
            <span className="attach-file-ico">
              <Music size={15} />
            </span>
          ) : (
            <span className="attach-file-ico">
              <FileText size={15} />
            </span>
          )}
          <span className="attach-meta">
            <strong>{a.name}</strong>
            <em>{a.kind === 'ref' ? 'workspace' : kb(a.size)}</em>
          </span>
          <button className="attach-x" onClick={() => removePending(a.id)} title="Remove">
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

const MemoMsg = memo(Msg)

function TodoWidget({ todos, onClose }) {
  const done = todos.filter((t) => t.status === 'completed').length
  const pct = Math.round((done / Math.max(1, todos.length)) * 100)
  return (
    <div className="todo-widget popover">
      <div className="todo-head">
        <span>Tasks</span>
        <span className="todo-count">
          {done}/{todos.length}
        </span>
        <button className="icon-btn todo-x" onClick={onClose} title="Hide for this session">
          <X size={12} />
        </button>
      </div>
      <div className="todo-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="todo-list">
        {todos.map((t, i) => (
          <div key={i} className={`todo-row ${t.status}`}>
            <span className="todo-dot" />
            <span className="todo-text">{t.content}</span>
            <span className={`todo-prio ${t.priority}`} title={t.priority} />
          </div>
        ))}
      </div>
    </div>
  )
}

function CommandMenu({ commands, selected, onPick, onHover }) {
  if (!commands.length) return null
  return (
    <div className="cmd-pop popover">
      {commands.map((c, i) => (
        <div
          key={c.name}
          className={`cmd-row${i === selected ? ' on' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(c.name)
          }}
          onMouseEnter={() => onHover(i)}
        >
          <SquareTerminal size={13} />
          <span className="cmd-name">/{c.name}</span>
          <span className="cmd-desc">{c.description || ''}</span>
        </div>
      ))}
    </div>
  )
}

// Mode picker for `/mode`: same popover shell as slash commands, but each
// row is a soul+system pack (check = active). Mouse uses onMouseDown so the
// pick lands before the textarea blurs.
function ModeMenu({ modes, activeId, selected, onPick, onHover }) {
  if (!modes.length) return null
  return (
    <div className="cmd-pop popover">
      {modes.map((m, i) => (
        <div
          key={m.id}
          className={`cmd-row${i === selected ? ' on' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(m.id)
          }}
          onMouseEnter={() => onHover(i)}
        >
          <span className={`mode-dot${m.id === activeId ? ' on' : ''}`} />
          <span className="cmd-name">{m.name}</span>
          <span className="cmd-desc">
            {m.id}
            {m.id === activeId ? ' · active' : ''}
          </span>
          {m.id === activeId && <Check size={13} className="dd-check" />}
        </div>
      ))}
    </div>
  )
}

// Model picker for `/model`: mirrors the composer model-badge dropdown
// (free section + paid section get flattened, filter already applied).
function ModelMenu({ models, currentKey, selected, onPick, onHover }) {
  if (!models.length) return null
  return (
    <div className="cmd-pop popover">
      {models.map((m, i) => (
        <div
          key={m.key}
          className={`cmd-row${i === selected ? ' on' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(m.key)
          }}
          onMouseEnter={() => onHover(i)}
        >
          <span className="cmd-name">{m.name}</span>
          <span className="cmd-desc">{m.hint}</span>
          {m.key === currentKey && <Check size={13} className="dd-check" />}
        </div>
      ))}
    </div>
  )
}

// Slash picks expand to their template ($ARGUMENTS = the rest of the line)
// and ride a normal prompt turn — no special backend path.
function expandTemplate(template, args) {
  const t = String(template || '')
  if (!t) return null
  if (/\$ARGUMENTS/.test(t)) return t.replace(/\$ARGUMENTS/g, args || '').trim()
  return args ? `${t}\n\n${args}` : t
}

// Prompt rail: one tick per prompt on a spine. Scroll-spies the transcript
// (the tick of the message in view glows), auto-scrolls so the latest tick
// stays visible on long threads, and jumps to a message on click. The hover
// preview is positioned at rail level so the scrolling track never clips it.
function PromptRail({ messages, scrollRoot }) {
  const qs = messages.filter((m) => m.role === 'user' && m.id)
  const qsKey = qs.map((q) => q.id).join(',')
  const [activeId, setActiveId] = useState(null)
  const [tip, setTip] = useState(null) // { id, n, text, top }
  const trackRef = useRef(null)
  const railRef = useRef(null)
  useEffect(() => {
    const root = scrollRoot?.current
    if (!root || qs.length < 2) return undefined
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveId(e.target.id.replace(/^msg-/, ''))
        }
      },
      { root, rootMargin: '-35% 0px -50% 0px' }
    )
    for (const q of qs) {
      const el = document.getElementById(`msg-${q.id}`)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qsKey])
  const target = activeId && qs.some((q) => q.id === activeId) ? activeId : qs[qs.length - 1]?.id
  useEffect(() => {
    if (!target || !trackRef.current) return
    trackRef.current
      .querySelector(`[data-tick="${CSS.escape(target)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [target])
  if (qs.length < 2) return null
  const jump = (id) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const showTip = (q, i, el) => {
    const rail = railRef.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!rail) return
    setTip({ id: q.id, n: i + 1, text: q.text, top: r.top + r.height / 2 - rail.top })
  }
  return (
    <div className="prompt-rail" ref={railRef}>
      <div className="prompt-rail-track" ref={trackRef} onScroll={() => setTip(null)}>
        <div className="prompt-rail-inner">
          {qs.map((q, i) => (
            <div
              key={q.id}
              data-tick={q.id}
              className={`tick${q.id === target ? ' active' : ''}${i === qs.length - 1 ? ' latest' : ''}`}
              onClick={() => jump(q.id)}
              onMouseEnter={(e) => showTip(q, i, e.currentTarget)}
              onMouseLeave={() => setTip(null)}
            />
          ))}
        </div>
      </div>
      {tip && (
        <div className="tick-tip" style={{ top: tip.top }}>
          <span className="tip-n">{tip.n}</span>
          {tip.text}
        </div>
      )}
    </div>
  )
}

const IMG_EXTS_C = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
const TEXT_EXTS_C = [
  'txt',
  'md',
  'markdown',
  'js',
  'jsx',
  'ts',
  'tsx',
  'json',
  'css',
  'html',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'cs',
  'go',
  'rs',
  'rb',
  'php',
  'sh',
  'yml',
  'yaml',
  'toml',
  'csv',
  'log',
  'sql',
  'xml',
  'svg'
]
const readAsTextFile = (f) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result || ''))
    r.onerror = rej
    r.readAsText(f)
  })
const readAsDataURLFile = (f) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result || ''))
    r.onerror = rej
    r.readAsDataURL(f)
  })
const downscaleImageFile = (f) =>
  new Promise((res, rej) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      try {
        const max = 1536
        const sc = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.width * sc))
        c.height = Math.max(1, Math.round(img.height * sc))
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(url)
        res(c.toDataURL('image/jpeg', 0.82))
      } catch (e) {
        rej(e)
      }
    }
    img.onerror = rej
    img.src = url
  })

// Per-pane composer state: input, attachments, slash menus, send errors,
// scroll refs. One instance backs the hero, one backs each open thread —
// App itself holds no composer state, so split panes never share a draft.
function useComposer({
  sid,
  messages,
  working,
  ctxMenuOpen,
  ocCommands,
  modeCfg,
  allModelsFlat,
  ocModel,
  setOcModel,
  setModeId,
  enterToSend,
  note,
  ensureSession,
  sendTurn,
  stopTurn
}) {
  const [input, setInput] = useState('')
  const [pending, setPending] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sendError, setSendError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [cmdSel, setCmdSel] = useState(0)
  const [cmdDismissed, setCmdDismissed] = useState('')
  const [pickSel, setPickSel] = useState(0)
  const [pickDismissed, setPickDismissed] = useState('')
  const taRef = useRef(null)
  const attachRef = useRef(null)
  const attachWrapRef = useRef(null)
  const tRef = useRef(null)
  const stickRef = useRef(true)

  const clear = () => {
    setInput('')
    setPending([])
  }
  const stick = () => {
    stickRef.current = true
  }
  const failHere = (msg) => (sid ? note(msg, sid) : setSendError(msg))

  // Stick to bottom while new content streams.
  useEffect(() => {
    const el = tRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages, working])

  // Textarea auto-grow, capped.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(160, Math.max(36, el.scrollHeight)) + 'px'
  }, [input])

  const submit = async () => {
    const raw = input
    if (!raw.trim() && !pending.length) return
    setSendError('')
    let id = sid
    if (!id) {
      try {
        id = await ensureSession()
      } catch (e) {
        setSendError('Could not create session: ' + (e.message || e))
        return
      }
      if (!id) {
        setSendError('Could not create session.')
        return
      }
    }
    await sendTurn(id, raw, pending, { clear, stick })
  }

  const addFiles = async (list) => {
    const files = [...(list || [])]
    if (!files.length) return
    let room = 5 - pending.length
    for (const f of files) {
      if (room <= 0) {
        failHere('Attachment limit is 5 per message.')
        break
      }
      const ext = (f.name.split('.').pop() || '').toLowerCase()
      const isPdf = f.type === 'application/pdf' || ext === 'pdf'
      try {
        if (f.type.startsWith('image/') && !isPdf) {
          if (f.size > 8 * 1024 * 1024) {
            failHere(`Skipped ${f.name}: images must be under 8MB.`)
            continue
          }
          let url = null
          let mime = 'image/jpeg'
          try {
            url = await downscaleImageFile(f)
          } catch {
            // Canvas decode failed (e.g. HEIC bytes in a .jpg, corrupt file):
            // fall back to the original bytes and let the model decide.
            if (f.size > 12 * 1024 * 1024) {
              failHere(`Skipped ${f.name}: the image could not be processed and is over 12MB.`)
              continue
            }
            try {
              url = await readAsDataURLFile(f)
              mime = f.type || 'image/jpeg'
            } catch {
              failHere(`Could not read ${f.name}.`)
              continue
            }
          }
          const item = {
            id: 'a' + Date.now() + Math.random().toString(16).slice(2),
            name: f.name,
            size: f.size,
            kind: 'image',
            mime,
            url
          }
          setPending((p) => [...p, item])
          room--
        } else if (isPdf) {
          if (f.size > 10 * 1024 * 1024) {
            failHere(`Skipped ${f.name}: PDFs must be under 10MB.`)
            continue
          }
          const url = await readAsDataURLFile(f)
          const item = {
            id: 'a' + Date.now() + Math.random().toString(16).slice(2),
            name: f.name,
            size: f.size,
            kind: 'pdf',
            mime: 'application/pdf',
            url,
            path: f.path || ''
          }
          setPending((p) => [...p, item])
          room--
        } else if (f.type.startsWith('audio/') || AUDIO_EXTS.includes(ext)) {
          if (f.size > 20 * 1024 * 1024) {
            failHere(`Skipped ${f.name}: audio files must be under 20MB.`)
            continue
          }
          const url = await readAsDataURLFile(f)
          const item = {
            id: 'a' + Date.now() + Math.random().toString(16).slice(2),
            name: f.name,
            size: f.size,
            kind: 'audio',
            mime: f.type || 'audio/mpeg',
            url
          }
          setPending((p) => [...p, item])
          room--
        } else if (f.type.startsWith('text/') || TEXT_EXTS_C.includes(ext)) {
          if (f.size > 256 * 1024) {
            failHere(`Skipped ${f.name}: text files must be under 256KB.`)
            continue
          }
          const raw = await readAsTextFile(f)
          const item = {
            id: 'a' + Date.now() + Math.random().toString(16).slice(2),
            name: f.name,
            size: f.size,
            kind: 'text',
            text: raw.slice(0, 12000)
          }
          setPending((p) => [...p, item])
          room--
        } else {
          failHere(`Skipped ${f.name}: only images, PDFs, audio and text files for now.`)
        }
      } catch {
        failHere(`Could not read ${f.name}.`)
      }
    }
  }
  const toggleRef = (relPath) => {
    const name = relPath.split(/[\\/]/).pop()
    setPending((prev) => {
      if (prev.some((a) => a.kind === 'ref' && a.path === relPath)) {
        return prev.filter((a) => !(a.kind === 'ref' && a.path === relPath))
      }
      if (prev.length >= 5) {
        failHere('Attachment limit is 5 per message.')
        return prev
      }
      return [
        ...prev,
        {
          id: 'r' + Date.now() + Math.random().toString(16).slice(2),
          kind: 'ref',
          path: relPath,
          name,
          size: 0
        }
      ]
    })
  }
  const removePending = (id) => setPending((p) => p.filter((x) => x.id !== id))
  const onPasteImage = (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    addFiles(files)
  }
  const dropProps = {
    onDragOver: (e) => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(false)
      addFiles(e.dataTransfer?.files)
    }
  }

  // Slash-command autocomplete: `/` + prefix at message start, like the TUI.
  const cmdMatch = input.match(/^\/([A-Za-z0-9_-]*)$/)
  const localCmds = [
    { name: 'mode', description: 'Switch mode…' },
    { name: 'model', description: 'Switch model…' }
  ]
  const cmdFiltered = cmdMatch
    ? [
        ...localCmds.filter((c) => c.name.toLowerCase().startsWith(cmdMatch[1].toLowerCase())),
        ...ocCommands.filter((c) => c.name.toLowerCase().startsWith(cmdMatch[1].toLowerCase()))
      ]
    : []
  const modeMatch = input.match(/^\/mode(?:\s+([\s\S]*))?$/i)
  const modelMatch = input.match(/^\/model(?:\s+([\s\S]*))?$/i)
  const modeFilter = (modeMatch?.[1] || '').trim().toLowerCase()
  const modelFilter = (modelMatch?.[1] || '').trim().toLowerCase()
  const modeFiltered = modeMatch
    ? (modeCfg.modes || []).filter(
        (m) =>
          !modeFilter ||
          m.id.toLowerCase().includes(modeFilter) ||
          (m.name || '').toLowerCase().includes(modeFilter)
      )
    : []
  const modelFiltered = modelMatch
    ? allModelsFlat.filter(
        (m) => !modelFilter || `${m.name} ${m.hint} ${m.key}`.toLowerCase().includes(modelFilter)
      )
    : []
  const modeOpen = !!modeMatch && modeFiltered.length > 0 && input !== pickDismissed
  const modelOpen =
    !modeMatch && !!modelMatch && modelFiltered.length > 0 && input !== pickDismissed
  const cmdOpen =
    !!cmdMatch && cmdFiltered.length > 0 && input !== cmdDismissed && !modeMatch && !modelMatch
  const completeCmd = (name) => {
    if (!name) return
    setInput(`/${name} `)
    setCmdSel(0)
    setPickSel(0)
    setPickDismissed('')
  }
  // Staged command tag: `/name args…` with following text becomes a chip that
  // expands to the command template on send.
  const tagParse = input.match(/^\/([A-Za-z0-9_-]+)\s+([\s\S]*)$/)
  const tagCmd = tagParse && ocCommands.find((c) => c.name === tagParse[1])
  const untag = () => setInput(input.replace(/^\/[A-Za-z0-9_-]+\s+/, ''))
  const pickMode = async (id) => {
    const hit = (modeCfg.modes || []).find((m) => m.id === id)
    setInput('')
    setPickSel(0)
    setPickDismissed('')
    if (!hit) return
    try {
      await setModeId(hit.id)
    } catch (e) {
      failHere(`Could not switch mode: ${e?.message || e}`)
      return
    }
    if (sid) note(`Switched to **${hit.name}** mode. New turns use its prompts.`, sid)
  }
  const pickModel = (key) => {
    const i = key.indexOf('/')
    if (i > 0) setOcModel({ providerID: key.slice(0, i), modelID: key.slice(i + 1) })
    setInput('')
    setPickSel(0)
    setPickDismissed('')
  }
  const onKey = (e) => {
    if (modeOpen || modelOpen) {
      const list = modeOpen ? modeFiltered : modelFiltered
      const pick = modeOpen ? (id) => pickMode(id) : (key) => pickModel(key)
      const keyOf = modeOpen ? (m) => m.id : (m) => m.key
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPickSel((s) => (s + 1) % list.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPickSel((s) => (s - 1 + list.length) % list.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(keyOf(list[pickSel % list.length]))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setPickDismissed(input)
        return
      }
    }
    if (cmdOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCmdSel((s) => (s + 1) % cmdFiltered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCmdSel((s) => (s - 1 + cmdFiltered.length) % cmdFiltered.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        completeCmd(cmdFiltered[cmdSel]?.name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCmdDismissed(input)
        return
      }
    }
    if (e.key === 'Escape' && working && !pickerOpen && !ctxMenuOpen) {
      e.preventDefault()
      stopTurn(sid)
      return
    }
    const sendKey = enterToSend
      ? e.key === 'Enter' && !e.shiftKey
      : e.key === 'Enter' && (e.ctrlKey || e.metaKey)
    if (sendKey) {
      e.preventDefault()
      submit()
    }
  }

  return {
    input,
    pending,
    pickerOpen,
    setPickerOpen,
    sendError,
    dragging,
    taRef,
    attachRef,
    attachWrapRef,
    tRef,
    stickRef,
    cmdSel,
    setCmdSel,
    cmdFiltered,
    cmdOpen,
    completeCmd,
    tagCmd,
    untag,
    modeOpen,
    modelOpen,
    modeFiltered,
    modelFiltered,
    pickSel,
    setPickSel,
    modeActiveId: modeCfg.activeMode,
    modelKey: modelKey(ocModel),
    stop: () => stopTurn(sid),
    pickMode,
    pickModel,
    submit,
    onKey,
    onPasteImage,
    addFiles,
    toggleRef,
    removePending,
    dropProps,
    setInput
  }
}

// One open thread: transcript + composer for a single session. The main pane
// and the split-screen pane are two instances — each owns its composer.
function ThreadPane(props) {
  const {
    sid,
    session,
    messages,
    working,
    liveId,
    transcriptLoading,
    tokens,
    modelLimit,
    todoHiddenFor,
    onHideTodos,
    loaderVariant,
    modelPicker,
    thinkPicker,
    wsPicker,
    connEl,
    gitBranch,
    qReq,
    answerQuestion,
    onPreview,
    composer
  } = props
  const c = composer
  // This pane's context readout (latest assistant step ≈ current context).
  let ctxInput = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = messages[i]?.tokens
    if (messages[i]?.role === 'assistant' && t && typeof t.input === 'number') {
      ctxInput = t.input
      break
    }
  }
  const ctxPct =
    modelLimit > 0 && ctxInput > 0
      ? Math.min(100, Math.max(1, Math.round((ctxInput / modelLimit) * 100)))
      : null
  const ctxLabel =
    ctxPct !== null ? `${ctxPct}% · ${fmtTok(ctxInput)}` : ctxInput > 0 ? fmtTok(ctxInput) : '—'
  const ctxTitle =
    ctxInput > 0
      ? `${ctxInput.toLocaleString()}${modelLimit > 0 ? ` / ${modelLimit.toLocaleString()}` : ''} context tokens` +
        (tokens
          ? ` · ${tokens.input.toLocaleString()} in / ${tokens.output.toLocaleString()} out this session · $${Number(tokens.cost || 0).toFixed(4)}`
          : '')
      : 'Context usage appears here once the tutor replies'
  const showRail = messages.filter((m) => m.role === 'user' && m.id).length >= 2
  // Newest todowrite state in this session drives the live widget.
  const latestTodos = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const tools = Array.isArray(messages[i].tools) ? messages[i].tools : []
      for (let j = tools.length - 1; j >= 0; j--) {
        const t = tools[j]
        if (t && typeof t === 'object' && Array.isArray(t.todos) && t.todos.length) return t.todos
      }
    }
    return null
  })()
  const showTodos = latestTodos && todoHiddenFor !== sid
  return (
    <>
      {showTodos && <TodoWidget todos={latestTodos} onClose={() => onHideTodos(sid)} />}
      <div className={`transcript-wrap${showRail ? ' with-rail' : ''}`}>
        <div
          className="transcript"
          ref={c.tRef}
          onScroll={(e) => {
            const el = e.currentTarget
            c.stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
          }}
        >
          <div className="col">
            {transcriptLoading
              ? [82, 64, 76].map((w, i) => (
                  <div key={i} className="skel-msg" aria-hidden>
                    <div className="skel skel-line" style={{ width: `${w}%` }} />
                    <div className="skel skel-line short" />
                  </div>
                ))
              : messages.map((m, i) => (
                  <MemoMsg
                    key={m.id ?? i}
                    m={m}
                    onPreview={onPreview}
                    onQuestion={answerQuestion}
                    qReq={qReq}
                    live={!!liveId && m.id === liveId}
                  />
                ))}
            {working && (
              <div className="msg-ai">
                <LoadingState variant={loaderVariant} label="Thinking" />
              </div>
            )}
          </div>
        </div>
        <PromptRail messages={messages} scrollRoot={c.tRef} />
      </div>
      <div className="composer-wrap">
        <div className="col">
          <AttachChips pending={c.pending} removePending={c.removePending} />
          {c.sendError && <div className="send-err">{c.sendError}</div>}
          {c.tagCmd && (
            <div className="cmd-tag-row">
              <span className="cmd-tag">
                /{c.tagCmd.name}
                <button onClick={c.untag} title="Remove tag">
                  <X size={11} />
                </button>
              </span>
            </div>
          )}
          <div className={`composer2${c.dragging ? ' dragging' : ''}`} {...c.dropProps}>
            {c.cmdOpen && (
              <CommandMenu
                commands={c.cmdFiltered}
                selected={c.cmdSel}
                onPick={c.completeCmd}
                onHover={c.setCmdSel}
              />
            )}
            {c.modeOpen && (
              <ModeMenu
                modes={c.modeFiltered}
                activeId={c.modeActiveId}
                selected={c.pickSel % c.modeFiltered.length}
                onPick={c.pickMode}
                onHover={c.setPickSel}
              />
            )}
            {c.modelOpen && (
              <ModelMenu
                models={c.modelFiltered}
                currentKey={c.modelKey}
                selected={c.pickSel % c.modelFiltered.length}
                onPick={c.pickModel}
                onHover={c.setPickSel}
              />
            )}
            <span className="attach-wrap" ref={c.attachWrapRef}>
              <button
                className="icon-btn"
                title="Attach files"
                onClick={() => c.setPickerOpen((o) => !o)}
              >
                <Paperclip size={15} />
              </button>
              <AttachPicker
                wrapRef={c.attachWrapRef}
                open={c.pickerOpen}
                staged={c.pending}
                onToggle={c.toggleRef}
                onUpload={() => {
                  c.setPickerOpen(false)
                  c.attachRef.current?.click()
                }}
                onClose={() => c.setPickerOpen(false)}
              />
            </span>
            <input
              ref={c.attachRef}
              type="file"
              multiple
              accept="image/*,audio/*,.pdf,.mp3,.wav,.ogg,.m4a,.txt,.md,.js,.jsx,.ts,.tsx,.json,.css,.html,.py,.csv,.log"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
              onChange={(e) => {
                c.addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <textarea
              ref={c.taRef}
              rows={1}
              value={c.input}
              placeholder="Do anything…"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(e) => c.setInput(e.target.value)}
              onKeyDown={c.onKey}
              onPaste={c.onPasteImage}
            />
            {modelPicker}
            {thinkPicker}
            <button
              className={`send-round${working ? ' stop' : ''}`}
              onClick={working ? c.stop : c.submit}
              title={working ? 'Stop (Esc)' : 'Send'}
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
          </div>
          <div className="ctx-row">
            {wsPicker}
            <span className="ctx-item">
              <GitBranch size={12} /> {gitBranch}
            </span>
            {connEl}
            <span className="ctx-right" title={ctxTitle}>
              ◔ {ctxLabel}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

export default function App() {
  const { theme, appearance, enterToSend, loaderVariant } = useTheme()
  // Sessions live in the opencode server store (shared across repos and the
  // TUI). No local cache: the retired albert.sessions / albert.msgs keys are
  // dropped on boot — purely-local threads can't be imported (the server has
  // no message-import API) and offline drafts are gone (backend required).
  const [sessions, setSessions] = useState(() => {
    try {
      localStorage.removeItem('albert.sessions')
      localStorage.removeItem('albert.msgs')
    } catch {
      /* private mode */
    }
    return []
  })
  const sessionsLoaded = useRef(false)
  const [active, setActive] = useState(() => localStorage.getItem('albert.active') || null)
  const [query, setQuery] = useState('')
  const [sideOpen, setSideOpen] = useState(() => localStorage.getItem('albert.side') === '1')
  const [collapsedWs, setCollapsedWs] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('albert.wsCollapsed') || '[]')
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  })
  // Workspaces opened via New workspace / picker — kept even with zero
  // sessions so the group still appears in the sidebar.
  const [extraWs, setExtraWs] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('albert.wsExtra') || '[]')
      return Array.isArray(v) ? v.filter((d) => typeof d === 'string' && d) : []
    } catch {
      return []
    }
  })
  const rememberWorkspace = (dir) => {
    if (!dir) return
    setExtraWs((prev) => {
      if (prev.includes(dir)) return prev
      const next = [dir, ...prev].slice(0, 40)
      try {
        localStorage.setItem('albert.wsExtra', JSON.stringify(next))
      } catch {
        /* private mode */
      }
      return next
    })
  }
  const [view, setView] = useState(() => {
    const v = localStorage.getItem('albert.view') || 'study'
    return v === 'settings' ? 'settings' : 'study' // Study/Quiz tabs removed; only study + settings remain
  })
  const [settingsTab, setSettingsTab] = useState('general')
  const upd = useUpdater()
  const updActive = upd.supported && ['available', 'downloading', 'downloaded'].includes(upd.status)
  const openUpdates = () => {
    setSettingsTab('updates')
    setView('settings')
  }
  // Transcript cache: the server is the store (GET /session/:id/message);
  // this only avoids refetching a session already opened this run.
  const [store, setStore] = useState({})
  // Sidebar-level errors (session/workspace creation) — pane errors live in
  // each composer's own sendError.
  const [sideError, setSideError] = useState('')
  const [splitId, setSplitId] = useState(null) // second session id for split screen, or null
  const [gitOpen, setGitOpen] = useState(() => {
    try {
      return localStorage.getItem('albert.gitside') === '1'
    } catch {
      return false
    }
  })
  const toggleGit = () => {
    setGitOpen((o) => {
      try {
        localStorage.setItem('albert.gitside', o ? '0' : '1')
      } catch {
        /* private mode */
      }
      return !o
    })
  }
  const [workingIds, setWorkingIds] = useState({}) // server session id -> true while its turn runs
  const [tick, setTick] = useState(0) // re-render on token updates
  const tokensRef = useRef({}) // server session id -> { input, output, cost }
  const lastTick = useRef(0) // token-tick throttle timestamp
  const activeSession = sessions.find((s) => s.id === active) || null
  // This composer's turn runs (or not) — other sessions can run in parallel.
  const working = !!workingIds[activeSession?.id || active]

  const messages = (activeSession?.id && store[activeSession.id]) || []
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const updateMsgs = (fn, idOverride) => {
    const key = idOverride || activeSession?.id || active
    if (!key) return
    setStore((prev) => {
      const cur = prev[key] || []
      const next = (typeof fn === 'function' ? fn(cur) : fn).slice(-100)
      if (next === cur) return prev
      return { ...prev, [key]: next }
    })
  }

  useEffect(() => {
    localStorage.setItem('albert.active', active)
  }, [active])
  useEffect(() => {
    localStorage.setItem('albert.view', view)
  }, [view])

  // Never let a file drop navigate the window away.
  useEffect(() => {
    const stop = (e) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  // Session context menu state lives above its close effect (TDZ order matters).
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, id }
  const [renaming, setRenaming] = useState(null)
  const [qReq, setQReq] = useState({}) // tool callID -> question requestID (que_…)
  const [preview, setPreview] = useState(null) // attachment open in the right pane
  const [todoHiddenFor, setTodoHiddenFor] = useState(null) // session id with widget dismissed
  const [workspace, setWorkspaceState] = useState(
    () => localStorage.getItem('albert.workspace') || ''
  )
  const wsSynced = useRef(false)
  const menuRef = useRef(null)

  // Session context menu: close on outside click / Escape / scroll.
  useEffect(() => {
    if (!ctxMenu) return
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setCtxMenu(null)
    }
    const esc = (e) => {
      if (e.key === 'Escape') {
        setCtxMenu(null)
        setRenaming(null)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', close, true)
    }
  }, [ctxMenu])
  // Manual renames write through to the server (the source of truth); the
  // session.updated echo converges the optimistic update below.
  const commitRename = (id, title) => {
    const t = title.trim().slice(0, 60)
    setRenaming(null)
    if (!t) return
    setSessions((prev) => prev.map((x) => (x.id === id ? { ...x, title: t } : x)))
    window.api.opencode.setSessionTitle(id, t).catch(() => {})
  }

  // Threads are native server forks (parentID tracked opencode-side; the
  // fork copies history and keeps working in the same directory).
  const forkThread = async (id) => {
    setCtxMenu(null)
    try {
      const s = await window.api.opencode.fork(id)
      setSessions((prev) => (prev.some((x) => x.id === s.id) ? prev : [s, ...prev]))
      setActive(s.id)
      if (view === 'settings') setView('study')
    } catch (e) {
      note(`Could not fork thread: ${e.message || e}`, id)
    }
  }

  // Answer an agent question card (requestID comes from question.asked).
  // useCallback: stable identity keeps memoized messages from re-rendering.
  const answerQuestion = useCallback(async (requestID, answers) => {
    if (!requestID) throw new Error('question request not ready yet')
    return window.api.opencode.replyQuestion(requestID, answers)
  }, [])

  const toggleSide = () => {
    setSideOpen((o) => {
      localStorage.setItem('albert.side', o ? '0' : '1')
      return !o
    })
  }
  // Ctrl/Cmd+B toggles the session sidebar, Ctrl/Cmd+G the git panel,
  // Ctrl/Cmd+N new session, Ctrl/Cmd+D new workspace — from anywhere
  // (inputs included; browsers bind nothing useful to these inside fields).
  const newSessionRef = useRef(() => {})
  const pickWorkspaceRef = useRef(() => {})
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const key = (e.key || '').toLowerCase()
      if (key === 'b') {
        e.preventDefault()
        toggleSide()
      } else if (key === 'g') {
        e.preventDefault()
        toggleGit()
      } else if (k === 'n') {
        e.preventDefault()
        newSessionRef.current()
      } else if (k === 'd') {
        e.preventDefault()
        pickWorkspaceRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openSession = (id) => {
    // Opening the split session promotes it instead of duplicating it in
    // both panes (swap when a primary exists, take over when it doesn't).
    if (id && id === splitId) {
      if (active) swapSplit()
      else {
        setActive(id)
        setSplitId(null)
      }
      if (view === 'settings') setView('study')
      return
    }
    setActive(id)
    if (view === 'settings') setView('study')
  }

  // The server is the session store: pull the cross-repo list (newest first).
  // Sessions created elsewhere (TUI, other checkouts) appear here too.
  const refreshSessions = useCallback(async () => {
    try {
      const list = await window.api.opencode.sessions({ limit: 200 })
      if (Array.isArray(list)) {
        setSessions(list)
        sessionsLoaded.current = true
      }
    } catch {
      /* backend offline — keep the last list */
    }
  }, [])

  const newSession = async () => {
    try {
      const s = await window.api.opencode.createSession({ agent: modeAgent })
      setSessions((prev) => (prev.some((x) => x.id === s.id) ? prev : [s, ...prev]))
      setActive(s.id)
      setSideError('')
      if (view === 'settings') setView('study')
    } catch (e) {
      setSideError(`Could not create session: ${e?.message || e}`)
    }
  }
  newSessionRef.current = newSession

  const openSplit = (id) => {
    setCtxMenu(null)
    if (!id || id === active) return
    setSplitId(id)
    if (view === 'settings') setView('study')
  }

  const closeSplit = () => setSplitId(null)

  // Swap the primary and split sessions (split pane title click).
  const swapSplit = () => {
    if (!splitId) return
    const cur = active
    setActive(splitId)
    setSplitId(cur)
  }

  const deleteSession = (id) => {
    window.api.opencode.deleteSession(id).catch(() => {})
    liveById.current.delete(id)
    setStore((prev) => {
      if (!prev[id]) return prev
      const out = { ...prev }
      delete out[id]
      return out
    })
    if (id === splitId) setSplitId(null)
    setSessions((s) => {
      const next = s.filter((x) => x.id !== id)
      if (id === active) {
        // Deleted the primary: promote the split pane instead of jumping away.
        if (splitId && splitId !== id && next.some((x) => x.id === splitId)) {
          setActive(splitId)
          setSplitId(null)
        } else setActive(next[0]?.id || null)
      }
      return next
    })
  }

  const liveById = useRef(new Map()) // server session id -> live turn (parallel sessions)
  const {
    status: ocStatus,
    models: ocModels,
    paid: ocPaid,
    commands: ocCommands,
    model: ocModel,
    setModel: setOcModel,
    refresh: ocRefresh
  } = useOpencode(handleOcEvent)

  // Ephemeral local bubbles (never on the server): kept in the transcript
  // cache across server hydrations via the `local` flag.
  function note(text, id) {
    updateMsgs(
      (ms) => [
        ...ms,
        { id: 'n' + Date.now(), role: 'assistant', text, time: timeNow(), local: true }
      ],
      id
    )
  }

  // Modes (soul+system packs): main owns them per workspace; the renderer
  // caches the list + active id for the navbar, /mode, and Settings.
  const [modeCfg, setModeCfg] = useState({ activeMode: 'opencode', modes: [] })
  const applyModesResult = useCallback((p) => {
    if (p)
      setModeCfg({
        activeMode: p.activeMode || 'opencode',
        modes: Array.isArray(p.modes) ? p.modes : []
      })
    return p
  }, [])
  const refreshModes = useCallback(async () => {
    try {
      const p = await window.api?.opencode?.prompts?.()
      return applyModesResult(p)
    } catch {
      /* backend offline */
    }
    return null
  }, [applyModesResult])
  // Active Alfred mode as its native opencode agent (synced to opencode.json
  // by the harness). Every turn and every new session carries it — except
  // the plain opencode mode, which is deliberately agentless: no agent, no
  // system prompt, raw opencode behavior.
  const modeAgent =
    modeCfg.activeMode && modeCfg.activeMode !== 'opencode' ? 'alfred-' + modeCfg.activeMode : ''
  const setModeId = async (id) => applyModesResult(await window.api.opencode.setMode(id))
  const saveCustomMode = async (payload) =>
    applyModesResult(await window.api.opencode.saveCustomMode(payload))
  const deleteCustomMode = async (id) =>
    applyModesResult(await window.api.opencode.deleteCustomMode(id))
  const activeModeName =
    (modeCfg.modes.find((m) => m.id === modeCfg.activeMode) || {}).name || 'Opencode'

  // /mode <id|name> — client-side mode switch, never sent to the model.
  // Bare /mode lists what's available.
  const runModeCommand = async (arg, sid, raw, ux) => {
    updateMsgs((m) => [...m, { id: 'u' + Date.now(), role: 'user', text: raw, local: true }], sid)
    ux.clear()
    ux.stick()
    const fail = (msg) => note(msg, sid)
    if (!ocStatus.running) {
      fail('Modes need the tutor backend — wait for `opencode` to come online, then retry.')
      return
    }
    const cfg = (await refreshModes()) || modeCfg
    const list = cfg.modes || []
    const fmtList = () => list.map((m) => `\`${m.id}\``).join(' · ') || '(none)'
    if (!arg) {
      note(`Usage: \`/mode <id>\` — available: ${fmtList()}`)
      return
    }
    const q = arg.toLowerCase()
    const hit = list.find((m) => m.id.toLowerCase() === q || m.name.toLowerCase() === q)
    if (!hit) {
      note(`Unknown mode \`${arg}\` — available: ${fmtList()}`)
      return
    }
    try {
      await setModeId(hit.id)
      note(`Switched to **${hit.name}** mode. New turns use its prompts.`, sid)
    } catch (e) {
      fail(`Could not switch mode: ${e?.message || e}`)
    }
  }

  const trunc = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s)
  const fmtPart = (v, n) => {
    if (v == null || v === '') return ''
    return trunc(typeof v === 'string' ? v : JSON.stringify(v, null, 2), n)
  }
  function summarizeParts(parts) {
    const texts = []
    const tools = []
    const thoughts = []
    const blocks = []
    for (const pt of parts.values()) {
      if (pt.type === 'text' && typeof pt.text === 'string') {
        texts.push(pt.text)
        blocks.push({ key: pt.id, kind: 'text', text: pt.text })
      } else if (pt.type === 'reasoning' && typeof pt.text === 'string' && pt.text)
        thoughts.push(pt.text)
      else if (pt.type === 'tool') {
        const st = pt.state || {}
        const toolName = String(pt.tool || '').toLowerCase()
        const action = mcpAction(toolName) || TOOL_ACTION[toolName] || 'other'
        const inp = st.input || {}
        const target =
          (typeof inp === 'object'
            ? inp.filePath ||
              inp.path ||
              inp.dir ||
              inp.pattern ||
              inp.command ||
              inp.cmd ||
              inp.url ||
              ''
            : '') ||
          st.title ||
          pt.tool ||
          'tool'
        // Structured todos for the live widget (todowrite input or output).
        const pickTodos = (v) => {
          if (Array.isArray(v)) return v
          if (v && typeof v === 'object' && Array.isArray(v.todos)) return v.todos
          return null
        }
        const rawTodos =
          toolName === 'todowrite'
            ? pickTodos(st.output ?? st.result ?? st.raw) || pickTodos(st.input)
            : null
        const tb = {
          key: pt.id,
          kind: 'tool',
          label:
            (action === 'memory' || action === 'search') && pt.tool.includes('_')
              ? pt.tool.split('_').slice(1).join('_')
              : String(target),
          done: st.status === 'completed',
          status: st.status || '',
          tool: pt.tool || '',
          action,
          callID: pt.callID || '',
          questions: action === 'ask' && Array.isArray(inp.questions) ? inp.questions : null,
          todos: rawTodos
            ? rawTodos
                .map((t) =>
                  typeof t === 'string'
                    ? { content: t, status: 'pending', priority: 'medium' }
                    : {
                        content: String(t.content ?? t.text ?? ''),
                        status: t.status || 'pending',
                        priority: t.priority || 'medium'
                      }
                )
                .filter((t) => t.content)
            : null,
          input: fmtPart(st.input, 1500),
          output: fmtPart(st.output ?? st.error ?? st.result ?? st.raw, 4000),
          // Raw tool args for the write/edit preview (the formatted strings
          // above are truncated). ToolChips parses filePath/content (write)
          // and oldString/newString (edit) out of this — object or JSON.
          rawInput: st.input ?? null
        }
        tools.push(tb)
        blocks.push(tb)
      }
    }
    return { text: texts.join('\n\n'), tools, reasoning: thoughts.join('\n\n'), blocks }
  }

  // Server message ({info, parts}) -> transcript bubble. Text/reasoning/tool
  // parts flow through the same summarizer as live SSE; file parts become
  // attachment chips; control parts (steps, snapshots, compaction…) are
  // skipped. Returns null for messages with nothing to show.
  function serverToUi(entry) {
    const { info, parts } = entry || {}
    if (!info || !Array.isArray(parts)) return null
    const time = fmtTs(info.time?.created)
    if (info.role === 'user') {
      const texts = []
      const atts = []
      for (const pt of parts) {
        if (pt.type === 'text' && typeof pt.text === 'string' && !pt.ignored) {
          const m = pt.text.match(/^Attached file (.*?):\n?([\s\S]*)$/)
          if (m) {
            atts.push({ id: pt.id, kind: 'text', name: m[1] || 'file', text: m[2] || '' })
            texts.push(pt.text)
          } else texts.push(pt.text)
        } else if (
          pt.type === 'file' &&
          pt.mime !== 'text/plain' &&
          pt.mime !== 'application/x-directory'
        ) {
          const name = pt.filename || 'file'
          if ((pt.mime || '').startsWith('image/')) {
            atts.push({ id: pt.id, kind: 'image', name, mime: pt.mime, url: pt.url })
          } else if (pt.mime === 'application/pdf') {
            atts.push({ id: pt.id, kind: 'pdf', name, mime: pt.mime, url: pt.url })
          } else {
            const abs = String(pt.url || '').replace(/^file:\/\/\//, '')
            atts.push({ id: pt.id, kind: 'ref', name, path: abs })
          }
        }
      }
      if (!texts.length && !atts.length) return null
      return { id: info.id, role: 'user', text: texts.join('\n\n'), attachments: atts, time }
    }
    if (info.role === 'assistant') {
      const { text, tools, reasoning, blocks } = summarizeParts(
        new Map(parts.map((p) => [p.id, p]))
      )
      const em = info.error || {}
      const errText =
        em.name === 'AbortedError'
          ? ''
          : typeof em.message === 'string'
            ? em.message
            : typeof em.name === 'string'
              ? em.name
              : ''
      // Per-message tokens drive the context meter (input of the latest step
      // ≈ current context size); kept on the bubble for the readout below.
      const tokens = info.tokens && typeof info.tokens.input === 'number' ? info.tokens : null
      if (!text && !tools.length && !reasoning) {
        if (!errText) return null
        return { id: info.id, role: 'assistant', text: errText, tools: [], time, tokens }
      }
      return {
        id: info.id,
        role: 'assistant',
        text: errText && !text ? errText : text,
        tools,
        reasoning,
        blocks,
        time,
        tokens
      }
    }
    return null
  }

  // SSE bursts can deliver dozens of part frames per second; coalesce them to
  // one React update per animation frame so long replies don't jank.
  const rafPending = useRef(null)
  const rafLive = useRef(null)
  const flushLiveParts = () => {
    rafPending.current = null
    const live = rafLive.current
    if (!live || !liveById.current.has(live.localId)) return
    const { text, tools, reasoning, blocks } = summarizeParts(live.parts)
    const liveId = live.liveId
    updateMsgs(
      (ms) => ms.map((m) => (m.id === liveId ? { ...m, text, tools, reasoning, blocks } : m)),
      live.localId
    )
  }

  function finishLive(err, live) {
    if (!live) return
    if (rafPending.current) {
      cancelAnimationFrame(rafPending.current)
      rafPending.current = null
    }
    liveById.current.delete(live.localId)
    setWorkingIds((prev) => {
      if (!prev[live.localId]) return prev
      const next = { ...prev }
      delete next[live.localId]
      return next
    })
    // Apply the very latest parts synchronously so a coalesced frame is never lost.
    const { text, tools, reasoning, blocks } = summarizeParts(live.parts)
    const liveId = live.liveId
    updateMsgs(
      (ms) =>
        ms.map((m) =>
          m.id === liveId
            ? {
                ...m,
                text,
                tools,
                reasoning,
                blocks,
                ...(err ? { text: (text ? text + '\n\n' : '') + err } : {})
              }
            : m
        ),
      live.localId
    )
    // Reconcile with the server transcript (single source of truth): replace
    // cached bubbles with server versions, keeping ephemeral local ones.
    const sid = live.localId
    window.api.opencode
      .messages(sid, { limit: 100 })
      .then((list) => {
        const server = (Array.isArray(list) ? list : []).map(serverToUi).filter(Boolean)
        if (!server.length) return
        setStore((prev) => {
          const cur = prev[sid] || []
          const local = cur.filter((m) => m.local)
          return { ...prev, [sid]: [...server, ...local] }
        })
      })
      .catch(() => {})
  }

  // SSE events arrive here from the main-process pump (single subscription).
  async function handleOcEvent(p) {
    if (!p || !p.type) return
    const props = p.properties || {}
    if ((p.type === 'session.updated' || p.type === 'session.created') && props.info?.id) {
      // Sessions are server objects: upsert the full info (title renames from
      // the title agent arrive here). No-op when nothing changed so token
      // ticks don't re-render the shell.
      const info = props.info
      setSessions((prev) => {
        const cur = prev.find((x) => x.id === info.id)
        if (!cur) return [{ ...info }, ...prev]
        if (cur.title === info.title && cur.time?.updated === info.time?.updated) return prev
        return prev.map((x) => (x.id === info.id ? { ...info } : x))
      })
      const t = props.info.tokens || {}
      const prevIn = tokensRef.current[props.info.id]?.input || 0
      tokensRef.current[props.info.id] = {
        input: t.input || 0,
        output: t.output || 0,
        cost: props.info.cost || 0
      }
      // Token ticks re-render the whole shell: at most ~1/s, or when input
      // crosses a 512-token boundary, so the % readout stays live but cheap.
      const now = Date.now()
      if (
        now - lastTick.current > 1000 ||
        Math.floor((t.input || 0) / 512) !== Math.floor(prevIn / 512)
      ) {
        lastTick.current = now
        setTick((n) => n + 1)
      }
    }
    if (p.type === 'session.deleted' && (props.sessionID || props.info?.id)) {
      // Deleted elsewhere (TUI, another checkout): drop locally.
      const gone = props.sessionID || props.info.id
      setSessions((prev) =>
        prev.some((x) => x.id === gone) ? prev.filter((x) => x.id !== gone) : prev
      )
      setStore((prev) => {
        if (!prev[gone]) return prev
        const out = { ...prev }
        delete out[gone]
        return out
      })
    }
    if (p.type.startsWith('permission')) {
      // Reply echoes (permission.replied/updated) carry no request — ignore.
      if (/repl|resolv|update/i.test(p.type)) return
      const reqId = props.requestID || props.requestId || props.id
      const sid = props.sessionID
      // Full-access mode: approve each request as it arrives. The transcript's
      // tool rows already show what ran, so no card or note is needed.
      if (reqId && sid && sessionsRef.current.some((x) => x.id === sid)) {
        try {
          await window.api.opencode.replyPermission(reqId, 'once')
        } catch {
          /* turn continues without it */
        }
      }
      return
    }
    if (p.type === 'question.asked' || p.type === 'question.v2.asked') {
      // The reply endpoint wants this event id (que_…), not the tool callID.
      const reqId = props.id
      const callID = props.tool?.callID
      if (reqId && callID) {
        setQReq((prev) => (prev[callID] === reqId ? prev : { ...prev, [callID]: reqId }))
      }
      return
    }
    const live = [...liveById.current.values()].find((l) => l.ocId === props.sessionID)
    if (!live) return
    // The server re-broadcasts our own user message over SSE — track its id
    // so its parts never leak into the live answer (echo bug).
    if (p.type === 'message.updated') {
      const info = props.info || {}
      if (info.role === 'user' && info.id) live.userMsgIds.add(info.id)
      return
    }
    if (p.type === 'message.part.updated') {
      const part = props.part
      if (!part || !part.id) return
      const partMsgId = part.messageID || part.messageId || props.messageID
      if (partMsgId && live.userMsgIds.has(partMsgId)) return
      live.parts.set(part.id, part)
      rafLive.current = live
      if (!rafPending.current) rafPending.current = requestAnimationFrame(flushLiveParts)
    } else if (p.type === 'session.idle') {
      finishLive(null, live)
    } else if (p.type === 'session.error') {
      const raw = props.error?.data?.message || props.error?.message || 'the tutor run failed.'
      // Small models (e.g. Codestral) sometimes emit clashing tool-call ids and
      // the provider rejects the whole turn — retry it once as pure chat.
      if (/duplicate tool call/i.test(raw) && live && !live.retriedTextOnly && live.promptText) {
        updateMsgs((ms) => ms.filter((m) => m.id !== live.liveId), live.localId)
        note('That model stumbled on tool calls — retrying text-only…', live.localId)
        try {
          await firePrompt(live.localId, live.liveId, live.promptText, live.wireAtts || [], {
            textOnly: true,
            agent: live.agent
          })
        } catch (e) {
          const l = liveById.current.get(live.localId)
          liveById.current.delete(live.localId)
          setWorkingIds((prev) => {
            const next = { ...prev }
            delete next[live.localId]
            return next
          })
          if (l) {
            updateMsgs((ms) => ms.filter((m) => m.id !== l.liveId), l.localId)
          }
          note('Could not reach the tutor backend: ' + (e.message || e), live.localId)
        }
        return
      }
      finishLive('Error: ' + raw, live)
    }
  }

  // Composer state (input, attachments, menus, refs) lives in useComposer —
  // one instance per pane — so the lines below only keep shared turn logic.
  // Component scope (handleOcEvent's retry path needs it too): starts a turn —
  // registers the live state, appends the placeholder, fires prompt_async.
  // sid is the server session id (the server is the session store).
  const firePrompt = async (sid, liveId, text, wireAtts, opts = {}) => {
    const agent = opts.agent || modeAgent
    liveById.current.set(sid, {
      ocId: sid,
      liveId,
      localId: sid,
      parts: new Map(),
      userMsgIds: new Set(),
      promptText: text,
      wireAtts,
      agent,
      retriedTextOnly: !!opts.textOnly
    })
    if (!opts.reusePlaceholder) {
      updateMsgs(
        (m) => [
          ...m,
          { id: liveId, role: 'assistant', text: '', tools: [], time: timeNow(), local: true }
        ],
        sid
      )
    }
    await window.api.opencode.prompt(
      sid,
      ocModel,
      text || '(see attached files)',
      wireAtts,
      variant || '',
      !!opts.textOnly,
      agent
    )
  }

  // Hero/main composer entry: ensures a server session, then delegates to
  // the shared turn core below (split panes call it via their own submit).
  const ensureSession = async () => {
    let sid = activeSession?.id || active
    if (sid && sessions.some((x) => x.id === sid)) return sid
    const s = await window.api.opencode.createSession({ agent: modeAgent })
    setSessions((prev) => (prev.some((x) => x.id === s.id) ? prev : [s, ...prev]))
    setActive(s.id)
    return s.id
  }
  // Core turn starter: the caller owns the session id, the raw text, the
  // staged attachments, and pane UI ({ clear(), stick() }). Used by every
  // composer (hero, main pane, split pane) via their submit().
  const sendTurn = async (sid, raw, atts, ux) => {
    const text = raw.trim()
    if ((!text && !atts.length) || workingIds[sid]) return
    const fail = (msg) => note(msg, sid)
    if (!ocStatus.running) {
      fail(
        'The tutor backend is offline. It starts with the app when `opencode` is on PATH; if no provider is logged in, run `opencode auth login` in a terminal, then retry.'
      )
      return
    }
    if (!ocStatus.connected?.length) {
      fail(
        'No AI provider is logged in. Run `opencode auth login` in a terminal (OpenRouter has free models), then retry.'
      )
      return
    }
    // /mode never reaches the model — it switches the prompt pack locally.
    const modeMatch = text.match(/^\/mode(?:\s+(\S[\s\S]*))?$/i)
    if (modeMatch) {
      await runModeCommand((modeMatch[1] || '').trim(), sid, text ? raw : text, ux)
      return
    }
    // /model is local too — it switches the model picker selection.
    const modelMatch = text.match(/^\/model(?:\s+(\S[\s\S]*))?$/i)
    if (modelMatch) {
      await runModelCommand((modelMatch[1] || '').trim(), sid, text ? raw : text, ux)
      return
    }
    const qid = 'u' + Date.now()
    const liveId = 'a' + qid
    // Slash pick (/review args…): the tag expands to the command template and
    // rides a normal prompt turn — the bubble keeps what you typed.
    const cmdParse = text.match(/^\/([A-Za-z0-9_-]+)\s*([\s\S]*)$/)
    const knownCmd = cmdParse && ocCommands.find((c) => c.name === cmdParse[1])
    const cmdArgs = knownCmd ? (cmdParse[2] || '').trim() : ''
    const sendText = knownCmd ? expandTemplate(knownCmd.template, cmdArgs) || text : text ? raw : ''
    const shownText = (text ? raw : '') || atts.map((a) => a.name).join(', ')
    const sentAtts = atts.map((a) => ({ ...a }))
    const modelCap = modelDef?.attachment
    const needsAttachment = (a) =>
      a.kind === 'image' ||
      a.kind === 'pdf' ||
      (a.kind === 'ref' &&
        ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'pdf'].includes(
          (a.path.split('.').pop() || '').toLowerCase()
        ))
    if (atts.some(needsAttachment) && ocModels.length && !modelCap) {
      fail(
        `\`${ocModel.modelID}\` can't take images or PDFs. Pick an attachment-capable model or remove the file.`
      )
      return
    }
    updateMsgs(
      (m) => [...m, { id: qid, role: 'user', text: shownText, attachments: sentAtts, local: true }],
      sid
    )
    ux.clear()
    ux.stick()
    setWorkingIds((prev) => ({ ...prev, [sid]: true }))
    // Audio has no model input path in this pipeline — it rides along as a
    // named attachment so the transcript shows it, but never hits the wire.
    const wireAtts = atts
      .filter((a) => !isAudioAtt(a))
      .map((a) =>
        a.kind === 'image'
          ? { kind: 'image', mime: a.mime, filename: a.name, url: a.url }
          : a.kind === 'pdf'
            ? a.path
              ? { kind: 'filepath', path: a.path, filename: a.name }
              : { kind: 'pdf', mime: 'application/pdf', filename: a.name, url: a.url }
            : a.kind === 'ref'
              ? { kind: 'ref', path: a.path, filename: a.name }
              : { kind: 'text', filename: a.name, text: a.text }
      )
    try {
      try {
        await firePrompt(sid, liveId, sendText, wireAtts)
      } catch (e) {
        // Server forgot the session (data dir wiped / another profile): the
        // list refresh converges; report and stop.
        if (/not found|404|no session/i.test(e.message || '')) {
          refreshSessions()
          throw new Error('That session is gone server-side — pick another thread and resend.')
        }
        throw e
      }
    } catch (e) {
      liveById.current.delete(sid)
      setWorkingIds((prev) => {
        if (!prev[sid]) return prev
        const next = { ...prev }
        delete next[sid]
        return next
      })
      note('Could not reach the tutor backend: ' + (e.message || e), sid)
    }
  }

  const stopTurn = async (sidOverride) => {
    const sid = sidOverride || activeSession?.id || active
    const live = liveById.current.get(sid)
    if (!live) return
    try {
      await window.api.opencode.abort(live.ocId)
    } catch {
      /* finalize regardless */
    }
    finishLive('(stopped)', live)
  }

  // Slash-command / mode / model menus live in each composer's own state
  // (see useComposer) — App keeps only shared turn logic from here on.
  const allModelsFlat = [
    ...ocModels.map((m) => ({ key: modelKey(m), name: m.name, hint: m.providerID })),
    ...ocPaid.map((m) => ({ key: modelKey(m), name: m.name, hint: `${m.providerID} · paid` }))
  ]
  // /model never reaches the model either — bare send() fallback when the
  // picker was dismissed (mirrors runModeCommand).
  const runModelCommand = async (arg, sid, raw, ux) => {
    updateMsgs((m) => [...m, { id: 'u' + Date.now(), role: 'user', text: raw, local: true }], sid)
    ux.clear()
    ux.stick()
    const fail = (msg) => note(msg, sid)
    if (!ocStatus.running) {
      fail('Models need the tutor backend — wait for `opencode` to come online, then retry.')
      return
    }
    const q = (arg || '').toLowerCase()
    const fmtList = () => allModelsFlat.map((m) => `\`${m.name}\``).join(' · ') || '(none)'
    if (!q) {
      note(`Usage: \`/model <name>\` — available: ${fmtList()}`)
      return
    }
    const hit = allModelsFlat.find(
      (m) =>
        m.key.toLowerCase() === q ||
        m.name.toLowerCase() === q ||
        m.key.toLowerCase().endsWith('/' + q)
    )
    if (!hit) {
      note(`Unknown model \`${arg}\` — available: ${fmtList()}`, sid)
      return
    }
    ux.pickModel(hit.key)
  }
  const visible = sessions.filter((s) =>
    ((s.title || '') + ' ' + (s.directory || '')).toLowerCase().includes(query.toLowerCase())
  )
  // First list pull still in flight: shimmer instead of a wrong "no sessions".
  const sessionsLoading = ocStatus.running && !sessionsLoaded.current
  const toggleWs = (dir) =>
    setCollapsedWs((prev) => {
      const next = prev.includes(dir) ? prev.filter((d) => d !== dir) : [...prev, dir]
      try {
        localStorage.setItem('albert.wsCollapsed', JSON.stringify(next))
      } catch {
        /* private mode */
      }
      return next
    })
  const [pinnedWs, setPinnedWs] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('albert.pinnedWs') || '[]')
      return Array.isArray(v) ? v.filter(Boolean) : []
    } catch {
      return []
    }
  })
  const togglePin = (dir) =>
    setPinnedWs((prev) => {
      const next = prev.includes(dir) ? prev.filter((d) => d !== dir) : [...prev, dir]
      try {
        localStorage.setItem('albert.pinnedWs', JSON.stringify(next))
      } catch {
        /* private mode */
      }
      return next
    })
  // Session ids are server ids now (no local mapping layer).
  const activeOcId = activeSession?.id || active
  // Restore the saved workspace once the backend is up.
  useEffect(() => {
    if (!ocStatus.running || wsSynced.current) return
    wsSynced.current = true
    refreshModes()
    const want = localStorage.getItem('albert.workspace') || ''
    if (want && want !== ocStatus.workspace) {
      window.api.opencode
        .setWorkspace(want)
        .then(() => ocRefresh())
        .catch(() => {})
    }
  }, [ocStatus.running, refreshModes])

  // Pull the cross-repo session list once the backend is up, and again
  // whenever the window regains focus (TUI/other checkouts may add some).
  useEffect(() => {
    if (!ocStatus.running) return
    refreshSessions()
  }, [ocStatus.running, refreshSessions])
  useEffect(() => {
    if (!ocStatus.running) return
    const onFocus = () => refreshSessions()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [ocStatus.running, refreshSessions])

  // The saved active id may point at a session deleted elsewhere: fall back
  // to the newest thread once the list has loaded at least once.
  useEffect(() => {
    if (!sessionsLoaded.current) return
    if (active && !sessions.some((s) => s.id === active)) setActive(sessions[0]?.id || null)
  }, [sessions, active])

  // Transcript hydration: first open of a session this run pulls its history
  // (newest 100) from the server. Ephemeral local bubbles merge after.
  // Covers the primary pane and the split pane.
  const hydrated = useRef(new Set())
  const hydrate = (id) => {
    if (!id || !ocStatus.running || hydrated.current.has(id)) return
    hydrated.current.add(id)
    window.api.opencode
      .messages(id, { limit: 100 })
      .then((list) => {
        const server = (Array.isArray(list) ? list : []).map(serverToUi).filter(Boolean)
        setStore((prev) => {
          const cur = prev[id] || []
          const known = new Set(cur.map((m) => m.id))
          const fresh = server.filter((m) => !known.has(m.id))
          if (!fresh.length) return prev
          return {
            ...prev,
            [id]: [...cur.filter((m) => !m.local), ...fresh, ...cur.filter((m) => m.local)]
          }
        })
      })
      .catch(() => {
        hydrated.current.delete(id)
      })
  }
  useEffect(() => {
    hydrate(activeSession?.id)
  }, [activeSession?.id, ocStatus.running])
  useEffect(() => {
    hydrate(splitId)
  }, [splitId, ocStatus.running])

  const effDir = workspace || ocStatus.workspace || ''
  // Session-synced context: the open thread's directory drives the composer
  // workspace/branch chips and the git panel (falls back to the picked
  // workspace when no session is open). Turns already run in the session's
  // directory server-side — this just makes it visible.
  const activeDir = activeSession?.directory || effDir
  const folderName = activeDir.split(/[\\/]/).filter(Boolean).pop() || ''
  const [gitState, setGitState] = useState({ dir: '', info: null, loading: false })
  const refreshGit = useCallback(async (dir) => {
    if (!dir) return
    setGitState((p) =>
      p.dir === dir ? { ...p, loading: true } : { dir, info: null, loading: true }
    )
    try {
      const info = await window.api.opencode.gitInfo(dir)
      setGitState((cur) => (cur.dir === dir ? { dir, info, loading: false } : cur))
    } catch {
      setGitState((cur) => (cur.dir === dir ? { dir, info: { repo: false }, loading: false } : cur))
    }
  }, [])
  useEffect(() => {
    if (activeDir) refreshGit(activeDir)
  }, [activeDir, refreshGit])
  useEffect(() => {
    if (gitOpen && activeDir) refreshGit(activeDir)
  }, [gitOpen, activeDir, refreshGit])
  // Files change under running turns — refresh the panel when one ends.
  const wasWorking = useRef({})
  useEffect(() => {
    let ended = false
    for (const sid of Object.keys(workingIds)) {
      if (wasWorking.current[sid] && !workingIds[sid]) ended = true
      wasWorking.current[sid] = workingIds[sid]
    }
    for (const sid of Object.keys(wasWorking.current)) {
      if (!workingIds[sid]) delete wasWorking.current[sid]
    }
    if (ended && gitOpen && activeDir) refreshGit(activeDir)
  }, [workingIds, gitOpen, activeDir, refreshGit])
  const activeGitInfo = gitState.dir === activeDir ? gitState.info : null
  const activeBranch =
    (activeGitInfo?.repo && activeGitInfo.branch) ||
    (activeGitInfo && !activeGitInfo.repo ? 'no repo' : null) ||
    (activeDir === effDir ? ocStatus.gitBranch : null) ||
    '—'
  // Per-thread tint: right-clicking a workspace group stores its header color
  // (background wash + folder icon). Purely cosmetic, never touches the theme.
  const [wsColors, setWsColors] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('albert.wsColors') || '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })
  const setWsColor = (dir, color) => {
    setWsColors((prev) => {
      const next = { ...prev }
      if (color && color !== 'default') next[dir] = color
      else delete next[dir]
      try {
        localStorage.setItem('albert.wsColors', JSON.stringify(next))
      } catch {
        /* private mode */
      }
      return next
    })
    setCtxMenu(null)
  }
  // Threads: server sessions grouped by their project directory — pinned
  // groups first (pin order), then the current workspace, then the rest
  // alphabetically. Sessions without a directory (older servers) group last
  // under Previous.
  const sessDir = (s) => s.directory || '__previous__'
  const wsHistory = useMemo(
    () => [
      ...new Set(
        [effDir, ...extraWs, ...sessions.map((s) => s.directory).filter(Boolean)].filter(Boolean)
      )
    ],
    [sessions, extraWs, effDir]
  )
  const groups = useMemo(() => {
    const map = new Map()
    for (const s of visible) {
      const key = sessDir(s)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    }
    // Current + remembered workspaces show even with no sessions yet
    // (skip empties while searching so the filter stays useful).
    if (!query.trim()) {
      for (const dir of [effDir, ...extraWs].filter(Boolean)) {
        if (!map.has(dir)) map.set(dir, [])
      }
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '__previous__') return 1
      if (b[0] === '__previous__') return -1
      const pa = pinnedWs.indexOf(a[0])
      const pb = pinnedWs.indexOf(b[0])
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb)
      if (a[0] === effDir) return -1
      if (b[0] === effDir) return 1
      return a[0].localeCompare(b[0])
    })
  }, [visible, effDir, pinnedWs, extraWs, query])

  const pickWorkspace = async () => {
    let dir = null
    try {
      dir = await window.api.opencode.pickFolder()
    } catch {
      return
    }
    if (dir) switchWorkspaceDir(dir)
  }
  pickWorkspaceRef.current = pickWorkspace

  // Switching workspace only changes where NEW sessions are created (the
  // server directory scope) plus MCP/course context. The session list is
  // global — every repo's threads stay visible, grouped by directory.
  const switchWorkspaceDir = async (dir, opts = {}) => {
    if (!dir) return
    try {
      await window.api.opencode.setWorkspace(dir)
      localStorage.setItem('albert.workspace', dir)
      setWorkspaceState(dir)
      rememberWorkspace(dir)
      tokensRef.current = {}
      setTick((n) => n + 1)
      // Surface the workspace in the session sidebar.
      setSideOpen(true)
      try {
        localStorage.setItem('albert.side', '1')
      } catch {
        /* private mode */
      }
      if (opts.keepGroups) {
        // New-session path: leave every other group exactly as it is, just
        // make sure the target group is visible.
        setCollapsedWs((prev) => {
          if (!prev.includes(dir)) return prev
          const next = prev.filter((d) => d !== dir)
          try {
            localStorage.setItem('albert.wsCollapsed', JSON.stringify(next))
          } catch {
            /* private mode */
          }
          return next
        })
      } else {
        // Manual switch: land directly in this workspace's thread — expand
        // only its group and activate its most recent session (or the empty
        // hero for a fresh one).
        const mine = sessionsRef.current.filter((s) => s.directory === dir)
        const others = new Set(
          [...sessionsRef.current.map((s) => s.directory), ...extraWs, effDir].filter(
            (w) => w && w !== dir
          )
        )
        setCollapsedWs([...others])
        try {
          localStorage.setItem('albert.wsCollapsed', JSON.stringify([...others]))
        } catch {
          /* private mode */
        }
        if (!opts.keepActive) {
          if (mine.length) {
            setActive(mine[0].id)
          } else {
            setActive(null)
            if (view === 'settings') setView('study')
          }
        }
      }
      ocRefresh()
      refreshModes()
      setSideError('')
    } catch (e) {
      setSideError(`Could not switch workspace: ${e.message || e}`)
    }
  }

  // "New session in <dir>": switch first (new sessions land in the target
  // directory), then create the server session there.
  const newSessionIn = async (dir) => {
    const target = dir || effDir
    if (target && target !== effDir)
      await switchWorkspaceDir(target, { keepGroups: true, keepActive: true })
    if (view === 'settings') setView('study')
    await newSession()
  }

  // Backfill token usage when opening a session that already ran server-side
  // (primary pane and split pane).
  const backfillTokens = (id) => {
    if (!id || tokensRef.current[id] || !ocStatus.running) return
    window.api.opencode
      .sessionGet(id)
      .then((info) => {
        if (info?.tokens) {
          tokensRef.current[id] = {
            input: info.tokens.input || 0,
            output: info.tokens.output || 0,
            cost: info.cost || 0
          }
          setTick((n) => n + 1)
        }
      })
      .catch(() => {})
  }
  useEffect(() => {
    backfillTokens(activeOcId)
  }, [activeOcId, ocStatus.running])
  useEffect(() => {
    backfillTokens(splitId)
  }, [splitId, ocStatus.running])
  const modelDef =
    ocModels.find((m) => m.providerID === ocModel.providerID && m.modelID === ocModel.modelID) ||
    ocPaid.find((m) => m.providerID === ocModel.providerID && m.modelID === ocModel.modelID)
  const modelLimit = modelDef?.limit || 0
  // Per-pane readouts (context %, rail, todos, skeletons) live in ThreadPane;
  // App keeps only the model limit both panes share.
  // Hero for the fresh-session state (no session, or a session known to be
  // empty): centered input like before. Sessions whose history hasn't loaded
  // yet show the thread view with a skeleton instead of a hero flash.
  const isHero =
    view !== 'settings' &&
    messages.length === 0 &&
    !working &&
    (!activeSession || hydrated.current.has(activeSession.id))
  const thinkLevels = modelDef?.variants || []
  const vKey = `albert.variant.${ocModel.providerID}/${ocModel.modelID}`
  const [variant, setVariantState] = useState('')
  // Reload the saved level whenever the model (or its catalog entry) changes;
  // drop it if the new model doesn't offer that level.
  useEffect(() => {
    let saved = ''
    try {
      saved = localStorage.getItem(vKey) || ''
    } catch {
      /* private mode */
    }
    setVariantState(thinkLevels.includes(saved) ? saved : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vKey, ocModels.length])
  const setVariant = (v) => {
    setVariantState(v)
    try {
      localStorage.setItem(vKey, v)
    } catch {
      /* private mode */
    }
  }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
  const modelPicker = (
    <span
      className="model-badge"
      title={
        ocStatus.running
          ? `${ocModels.length} free${ocPaid.length ? ` + ${ocPaid.length} paid` : ''} models available`
          : 'Tutor backend offline'
      }
    >
      <Dropdown
        direction="up"
        searchPlaceholder="Search models…"
        value={modelKey(ocModel)}
        onChange={(v) => {
          const i = v.indexOf('/')
          if (i > 0) setOcModel({ providerID: v.slice(0, i), modelID: v.slice(i + 1) })
        }}
        options={[
          ...ocModels.map((m) => ({ value: modelKey(m), label: m.name, hint: m.providerID })),
          ...(ocPaid.length ? [{ header: 'Paid · billed to your keys' }] : []),
          ...ocPaid.map((m) => ({
            value: modelKey(m),
            label: m.name,
            hint: `${m.providerID} · paid`
          }))
        ]}
      />
    </span>
  )
  const thinkPicker = thinkLevels.length ? (
    <span className="model-badge" title="Thinking level for this model">
      <Dropdown
        direction="up"
        value={variant}
        onChange={setVariant}
        options={[
          { value: '', label: 'Default' },
          ...thinkLevels.map((l) => ({ value: l, label: cap(l) }))
        ]}
      />
    </span>
  ) : null

  // ---- split screen + per-pane plumbing ----
  const splitSession = (splitId && sessions.find((s) => s.id === splitId)) || null
  // A split pointing at a deleted session evaporates instead of erroring.
  useEffect(() => {
    if (splitId && !sessionsLoaded.current) return
    if (splitId && !sessions.some((s) => s.id === splitId)) setSplitId(null)
  }, [sessions, splitId])
  const liveIdFor = (sid) =>
    [...liveById.current.values()].find((l) => l.localId === sid)?.liveId || null
  const loadingFor = (sid) =>
    !!sid &&
    ocStatus.running &&
    (store[sid]?.length || 0) === 0 &&
    !workingIds[sid] &&
    !hydrated.current.has(sid)
  // Shared composer environment: stable callbacks + catalog data. Each
  // ThreadPane (and the hero below) runs its own useComposer on top.
  const composerEnv = {
    ctxMenuOpen: !!ctxMenu,
    ocCommands,
    modeCfg,
    allModelsFlat,
    ocModel,
    setOcModel,
    setModeId,
    enterToSend,
    note,
    ensureSession,
    sendTurn,
    stopTurn
  }
  const heroC = useComposer({ sid: null, messages: [], working: false, ...composerEnv })
  const splitMessages = (splitId && store[splitId]) || []
  const mainC = useComposer({ sid: activeSession?.id || null, messages, working, ...composerEnv })
  const splitC = useComposer({
    sid: splitId,
    messages: splitMessages,
    working: !!workingIds[splitId],
    ...composerEnv
  })
  const wsPickerThread = (
    <WorkspacePicker
      effDir={activeDir}
      history={wsHistory}
      onPick={switchWorkspaceDir}
      onBrowse={pickWorkspace}
      direction="up"
      align="left"
      title={activeDir || 'Choose workspace folder'}
    />
  )
  const connEl = (
    <span
      className={`conn${ocStatus.running ? ' on' : ''}`}
      title={
        ocStatus.running
          ? `opencode ${ocStatus.version || ''} · ${(ocStatus.connected || []).join(', ')}`
          : 'Tutor backend offline — click to retry'
      }
      onClick={() => ocRefresh()}
    >
      <i />
      {ocStatus.running
        ? ocStatus.connected?.length
          ? `opencode ${ocStatus.version || ''}`
          : 'no provider login'
        : 'opencode offline'}
    </span>
  )
  // One pane's worth of props; the composer instance is wired by the caller
  // (mainC for the primary pane, splitC for the split pane).
  const paneProps = (sid, session, msgs, composer) => ({
    sid,
    session,
    messages: msgs,
    working: !!workingIds[sid],
    liveId: liveIdFor(sid),
    transcriptLoading: loadingFor(sid),
    tokens: (sid && tokensRef.current[sid]) || null,
    modelLimit,
    todoHiddenFor,
    onHideTodos: (id) => setTodoHiddenFor(id),
    loaderVariant,
    modelPicker,
    thinkPicker,
    wsPicker: wsPickerThread,
    connEl,
    gitBranch: activeBranch,
    qReq,
    answerQuestion,
    onPreview: setPreview,
    composer
  })

  return (
    <div className="shell">
      {isHero && <HeroChrome onTogglePanel={toggleSide} />}
      <div className="content">
        {sideOpen && (
          <aside className="sidebar">
            <div className="side-search">
              <Search size={13} />
              <input
                type="text"
                placeholder="Search sessions…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="search-clear" title="Clear" onClick={() => setQuery('')}>
                  <X size={11} />
                </button>
              )}
            </div>
            <div className="side-new">
              <NewMenu variant="side" onNewSession={newSession} onNewWorkspace={pickWorkspace} />
              {sideError && <div className="send-err">{sideError}</div>}
            </div>
            <div className="side-list scroll-fade">
              {sessionsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skel-row" aria-hidden>
                    <div
                      className="skel skel-title"
                      style={{ width: `${58 + ((i * 13) % 22)}%` }}
                    />
                    <div className="skel skel-sub" style={{ width: `${30 + ((i * 7) % 18)}%` }} />
                  </div>
                ))
              ) : (
                <>
                  {groups.map(([dir, list]) => {
                    const shut = collapsedWs.includes(dir)
                    const isPrev = dir === '__previous__'
                    const name = isPrev
                      ? 'Previous sessions'
                      : dir.split(/[\\/]/).filter(Boolean).pop() || dir
                    const tint = WS_COLORS[wsColors[dir]]
                    const pinned = pinnedWs.includes(dir)
                    return (
                      <div
                        key={dir}
                        className={`ws-group${tint ? ' tinted' : ''}`}
                        style={tint ? { '--ws-tint': tint } : undefined}
                      >
                        <div
                          className="ws-head"
                          onClick={() => toggleWs(dir)}
                          title={
                            isPrev
                              ? 'Sessions from before workspace tracking — right-click for color'
                              : `${dir} — right-click for color`
                          }
                          style={
                            tint
                              ? { background: `color-mix(in srgb, ${tint} 14%, transparent)` }
                              : undefined
                          }
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setCtxMenu({
                              x: Math.min(e.clientX, window.innerWidth - 220),
                              y: Math.min(e.clientY, window.innerHeight - 220),
                              ws: dir
                            })
                          }}
                        >
                          <span className={`chev${shut ? '' : ' down'}`}>›</span>
                          <Folder
                            size={16}
                            className="ws-ico"
                            style={tint ? { color: tint } : undefined}
                          />
                          <span className="ws-text">
                            <span className="ws-name">{name}</span>
                            <span className="ws-sub">
                              {(() => {
                                const running = list.filter((s) => workingIds[s.id]).length
                                const n = list.length
                                const parts =
                                  dir && !isPrev ? dir.split(/[\\/]/).filter(Boolean) : []
                                const parent = parts.length > 1 ? parts[parts.length - 2] : ''
                                return [
                                  n === 0 ? 'No sessions yet' : `${n} session${n === 1 ? '' : 's'}`,
                                  running ? `${running} running` : null,
                                  parent ? parent : null
                                ]
                                  .filter(Boolean)
                                  .join(' · ')
                              })()}
                            </span>
                          </span>
                          {pinned && (
                            <button
                              className="ws-pin"
                              title="Pinned to top — click to unpin"
                              onClick={(e) => {
                                e.stopPropagation()
                                togglePin(dir)
                              }}
                            >
                              <Pin size={12} />
                            </button>
                          )}
                          {!isPrev && (
                            <button
                              className="ws-new"
                              title={`New session in ${name}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                newSessionIn(dir)
                              }}
                            >
                              <Plus size={13} />
                            </button>
                          )}
                        </div>
                        {!shut &&
                          (list.length === 0 ? (
                            <div className="ws-empty">
                              {isPrev ? 'Nothing here.' : 'No sessions yet — hit + to start one.'}
                            </div>
                          ) : (
                            list.map((s) => (
                              <div
                                key={s.id}
                                className={`side-row${active === s.id ? ' selected' : ''}`}
                                onClick={() => openSession(s.id)}
                                onContextMenu={(e) => {
                                  e.preventDefault()
                                  setCtxMenu({
                                    x: Math.min(e.clientX, window.innerWidth - 210),
                                    y: Math.min(e.clientY, window.innerHeight - 150),
                                    id: s.id
                                  })
                                }}
                              >
                                {renaming === s.id ? (
                                  <input
                                    className="rename-input"
                                    autoFocus
                                    defaultValue={s.title}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitRename(s.id, e.target.value)
                                      else if (e.key === 'Escape') setRenaming(null)
                                    }}
                                    onBlur={(e) => commitRename(s.id, e.target.value)}
                                  />
                                ) : (
                                  <div className="side-row-text">
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                                      {s.title || 'New session'}
                                    </div>
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                      {sessSubtitle(s)}
                                    </div>
                                  </div>
                                )}
                                {workingIds[s.id] && <span className="run-dot" title="Running" />}
                                {splitId === s.id && (
                                  <span className="split-dot" title="Open in split screen" />
                                )}
                                <button
                                  className="row-del"
                                  title="Delete session"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteSession(s.id)
                                  }}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))
                          ))}
                      </div>
                    )
                  })}
                  {groups.length === 0 && (
                    <div className="side-empty">
                      {!ocStatus.running
                        ? 'Backend offline — sessions load when opencode is running.'
                        : sessions.length === 0
                          ? 'No workspaces yet — New → New workspace to open a folder.'
                          : 'No sessions match.'}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="side-foot">
              {updActive && (
                <button
                  className={`upd-banner ${upd.status}`}
                  onClick={openUpdates}
                  title={
                    upd.status === 'downloaded'
                      ? 'Open Updates to restart and install'
                      : `Update available${upd.latest ? ` (v${upd.latest})` : ''} — open Updates`
                  }
                >
                  <span className="upd-dot" />
                  <span className="upd-text">
                    {upd.status === 'downloaded'
                      ? 'Restart to update'
                      : upd.status === 'downloading'
                        ? 'Downloading update'
                        : `Update available${upd.latest ? ` · v${upd.latest}` : ''}`}
                  </span>
                  {upd.status === 'downloading' && <span className="upd-pct">{upd.progress}%</span>}
                </button>
              )}
              <div className="side-foot-row">
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {appearance} · {theme.isGlass ? 'glass' : 'opaque'}
                </span>
                <button
                  className={`icon-btn ${view === 'settings' ? 'on' : ''}`}
                  onClick={() => {
                    setSettingsTab('general')
                    setView('settings')
                  }}
                  title="Settings"
                >
                  <SettingsIcon size={14} />
                </button>
              </div>
            </div>
          </aside>
        )}
        <div className="main-col">
          {!isHero && (
            <Navbar
              onTogglePanel={toggleSide}
              onToggleGit={toggleGit}
              gitOpen={gitOpen}
              sessionLabel={activeSession ? activeSession.title || 'New session' : 'alfred'}
              modeLabel={activeModeName}
              newMenu={<NewMenu onNewSession={newSession} onNewWorkspace={pickWorkspace} />}
            />
          )}
          <div className="main">
            {view === 'settings' ? (
              <Settings
                tab={settingsTab}
                onTabChange={setSettingsTab}
                modes={modeCfg.modes}
                activeMode={modeCfg.activeMode}
                onActivateMode={setModeId}
                onSaveCustomMode={saveCustomMode}
                onDeleteCustomMode={deleteCustomMode}
                onModesChanged={refreshModes}
              />
            ) : isHero ? (
              <div className="hero">
                <div className="hero-body">
                  <div className="hero-col">
                    <div className="hero-selectors">
                      <button className="hero-sel" title="This device — single-device mode">
                        <Monitor size={13} /> {(ocStatus.hostname || 'This PC').toUpperCase()}{' '}
                        <ChevronDown size={12} />
                      </button>
                      <WorkspacePicker
                        effDir={activeDir}
                        history={wsHistory}
                        onPick={switchWorkspaceDir}
                        onBrowse={pickWorkspace}
                        title={activeDir || 'Choose workspace folder'}
                      />
                    </div>
                    <AttachChips pending={heroC.pending} removePending={heroC.removePending} />
                    {heroC.tagCmd && (
                      <div className="cmd-tag-row">
                        <span className="cmd-tag">
                          /{heroC.tagCmd.name}
                          <button onClick={heroC.untag} title="Remove tag">
                            <X size={11} />
                          </button>
                        </span>
                      </div>
                    )}
                    <div
                      className={`hero-composer${heroC.dragging ? ' dragging' : ''}`}
                      {...heroC.dropProps}
                    >
                      {heroC.cmdOpen && (
                        <CommandMenu
                          commands={heroC.cmdFiltered}
                          selected={heroC.cmdSel}
                          onPick={heroC.completeCmd}
                          onHover={heroC.setCmdSel}
                        />
                      )}
                      {heroC.modeOpen && (
                        <ModeMenu
                          modes={heroC.modeFiltered}
                          activeId={modeCfg.activeMode}
                          selected={heroC.pickSel % heroC.modeFiltered.length}
                          onPick={heroC.pickMode}
                          onHover={heroC.setPickSel}
                        />
                      )}
                      {heroC.modelOpen && (
                        <ModelMenu
                          models={heroC.modelFiltered}
                          currentKey={modelKey(ocModel)}
                          selected={heroC.pickSel % heroC.modelFiltered.length}
                          onPick={heroC.pickModel}
                          onHover={heroC.setPickSel}
                        />
                      )}
                      <textarea
                        ref={heroC.taRef}
                        rows={2}
                        value={heroC.input}
                        placeholder="Do anything…"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        onChange={(e) => heroC.setInput(e.target.value)}
                        onKeyDown={heroC.onKey}
                        onPaste={heroC.onPasteImage}
                      />
                      <div className="hero-composer-row">
                        <span className="attach-wrap" ref={heroC.attachWrapRef}>
                          <button
                            className="icon-btn"
                            title="Attach files"
                            onClick={() => heroC.setPickerOpen((o) => !o)}
                          >
                            <Paperclip size={15} />
                          </button>
                          <AttachPicker
                            wrapRef={heroC.attachWrapRef}
                            open={heroC.pickerOpen}
                            staged={heroC.pending}
                            onToggle={heroC.toggleRef}
                            onUpload={() => {
                              heroC.setPickerOpen(false)
                              heroC.attachRef.current?.click()
                            }}
                            onClose={() => heroC.setPickerOpen(false)}
                          />
                        </span>
                        <input
                          ref={heroC.attachRef}
                          type="file"
                          multiple
                          accept="image/*,audio/*,.pdf,.mp3,.wav,.ogg,.m4a,.txt,.md,.js,.jsx,.ts,.tsx,.json,.css,.html,.py,.csv,.log"
                          style={{
                            position: 'absolute',
                            width: 1,
                            height: 1,
                            opacity: 0,
                            overflow: 'hidden'
                          }}
                          onChange={(e) => {
                            heroC.addFiles(e.target.files)
                            e.target.value = ''
                          }}
                        />
                        {modelPicker}
                        {thinkPicker}
                        <span style={{ flex: 1 }} />
                        <button
                          className={`send-round${working ? ' stop' : ''}`}
                          onClick={working ? () => stopTurn() : heroC.submit}
                          title={working ? 'Stop (Esc)' : 'Send'}
                        >
                          <ArrowUp size={16} strokeWidth={2.4} />
                        </button>
                      </div>
                      {heroC.sendError && <div className="send-err">{heroC.sendError}</div>}
                    </div>
                    <div className="hero-meta">
                      <WorkspacePicker
                        effDir={activeDir}
                        history={wsHistory}
                        onPick={switchWorkspaceDir}
                        onBrowse={pickWorkspace}
                        title={activeDir ? `${folderName} checkout` : 'Choose workspace folder'}
                      />
                      <span className="ctx-item">
                        <GitBranch size={12} /> {activeBranch} <ChevronDown size={11} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`threads${splitSession ? ' split' : ''}`}>
                <div className="thread">
                  <ThreadPane {...paneProps(activeSession?.id, activeSession, messages, mainC)} />
                </div>
                {splitSession && (
                  <div className="thread">
                    <div className="thread-head">
                      <button
                        className="tt-title"
                        title="Swap with primary pane"
                        onClick={swapSplit}
                      >
                        {splitSession.title || 'New session'}
                      </button>
                      <button className="icon-btn" title="Close split" onClick={closeSplit}>
                        <X size={13} />
                      </button>
                    </div>
                    <ThreadPane {...paneProps(splitId, splitSession, splitMessages, splitC)} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {preview && <PreviewPane att={preview} onClose={() => setPreview(null)} />}
        {gitOpen && (
          <GitPanel
            dir={activeDir}
            info={activeGitInfo}
            loading={gitState.dir !== activeDir || gitState.loading}
            onRefresh={() => refreshGit(activeDir)}
            onClose={() => setGitOpen(false)}
          />
        )}
      </div>
      {ctxMenu && (
        <div ref={menuRef} className="ctx-menu popover" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {ctxMenu.ws ? (
            <>
              {ctxMenu.ws !== '__previous__' && (
                <div
                  className="ctx-menu-item"
                  onClick={() => {
                    togglePin(ctxMenu.ws)
                    setCtxMenu(null)
                  }}
                >
                  <Pin size={13} />{' '}
                  {pinnedWs.includes(ctxMenu.ws) ? 'Unpin from top' : 'Pin to top'}
                </div>
              )}
              <div className="ctx-menu-label">
                Thread color ·{' '}
                {ctxMenu.ws === '__previous__'
                  ? 'Previous sessions'
                  : ctxMenu.ws.split(/[\\/]/).filter(Boolean).pop() || ctxMenu.ws}
              </div>
              <div className="swatches menu-swatches">
                <button
                  className={`swatch none${!wsColors[ctxMenu.ws] ? ' on' : ''}`}
                  title="No tint"
                  onClick={() => setWsColor(ctxMenu.ws, 'default')}
                />
                {Object.entries(WS_COLORS).map(([k, v]) => (
                  <button
                    key={k}
                    className={`swatch${wsColors[ctxMenu.ws] === k ? ' on' : ''}`}
                    style={{ '--sw': v }}
                    title={k}
                    onClick={() => setWsColor(ctxMenu.ws, k)}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="ctx-menu-item" onClick={() => forkThread(ctxMenu.id)}>
                <MessagesSquare size={13} /> Fork as new thread
              </div>
              <div className="ctx-menu-item" onClick={() => openSplit(ctxMenu.id)}>
                <Columns2 size={13} /> Split screen
              </div>
              <div
                className="ctx-menu-item"
                onClick={() => {
                  setRenaming(ctxMenu.id)
                  setCtxMenu(null)
                }}
              >
                <Pencil size={13} /> Rename
              </div>
              <div
                className="ctx-menu-item danger"
                onClick={() => {
                  deleteSession(ctxMenu.id)
                  setCtxMenu(null)
                }}
              >
                <Trash2 size={13} /> Delete
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
