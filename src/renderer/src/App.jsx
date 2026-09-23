import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Check, ChevronDown, Copy, FileText, Folder, GitBranch, MessagesSquare, Monitor, Music, Paperclip, Pencil, Pin, Play, Plus, Search, Settings as SettingsIcon, Square, SquareTerminal, Trash2, X } from 'lucide-react'
import Navbar, { HeroChrome } from './components/Navbar'
import AttachPicker from './components/AttachPicker'
import PreviewPane from './components/PreviewPane'
import Settings from './components/Settings'
import Dropdown from './components/Dropdown'
import Markdown from './components/Markdown'
import LoadingState from './components/LoadingState'
import ToolChips from './components/ToolChips'
import ApprovalCard from './components/ApprovalCard'
import { useUpdater } from './updates/useUpdater'
import { useOpencode, modelKey, FAST_MODELS } from './opencode/useOpencode'
import { useTheme } from './theme/ThemeContext'

const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'webm']
const audioExtOf = (name = '') => String(name.split('.').pop() || '').toLowerCase()
const isAudioAtt = (a) => !!a && (a.kind === 'audio' || (a.kind === 'ref' && AUDIO_EXTS.includes(audioExtOf(a.path || a.name || ''))))

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
      } catch { /* not loaded yet */ }
    }
  }
  const close = () => {
    stop()
    setOpen(false)
  }

  if (!open) {
    return (
      <span className="msg-att clickable" title={`${a.name} — click to reopen player`} onClick={() => setOpen(true)}>
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
        <button className="icon-btn" onClick={stop} title="Stop"><Square size={11} /></button>
        <button className="icon-btn" onClick={close} title="Close player"><X size={12} /></button>
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
  new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const TOOL_ACTION = {
  read: 'read', task: 'read',
  write: 'write', edit: 'write',
  glob: 'list', grep: 'list', list: 'list', ls: 'list',
  bash: 'cmd', shell: 'cmd', sh: 'cmd', terminal: 'cmd',
  todo: 'todo', todowrite: 'todo',
  question: 'ask',
  webfetch: 'web', websearch: 'web'
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
    } catch { /* clipboard unavailable */ }
  }
  if (m.role === 'user') {
    return (
      <>
        <div className="msg-user" id={m.id ? `msg-${m.id}` : undefined}>{m.text}</div>
        {(m.attachments?.length > 0) && (
          <div className="msg-atts">
            {m.attachments.map((a, i) => (
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
            ))}
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
  const blocks = Array.isArray(m.blocks) && m.blocks.length
    ? m.blocks
    : [
        ...(m.tools || []).map((t, i) =>
          typeof t === 'string' ? { kind: 'tool', key: `t${i}`, label: t } : { kind: 'tool', key: t.callID || `t${i}`, ...t }
        ),
        ...(m.text ? [{ kind: 'text', key: 'text', text: m.text }] : [])
      ]
  let lastTextIdx = -1
  blocks.forEach((b, i) => {
    if (b.kind === 'text') lastTextIdx = i
  })
  const renderBlock = (b, i) => {
    if (b.kind !== 'tool') return <Markdown key={b.key || i} text={b.text} plain={live && i === lastTextIdx} />
    if (b.tool === 'question' && Array.isArray(b.questions) && b.questions.length) {
      return <ApprovalCard key={b.callID || b.key || i} tool={b} requestID={qReq[b.callID]} onAnswer={(answers) => onQuestion(qReq[b.callID], answers)} />
    }
    return <ToolChips key={b.key || i} label={b.label} done={b.done} status={b.status} tool={b.tool} action={b.action} input={b.input} output={b.output} />
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
        <button className="copy-btn" onClick={copy} title="Copy">{copied ? <Check size={12} /> : <Copy size={12} />}</button>
      </div>
    </div>
  )
}

function WorkspacePicker({ effDir, history, onPick, onBrowse, direction = 'down', align = 'right', title }) {
  const base = (d) => d.split(/[\\/]/).filter(Boolean).pop() || d
  const seen = [...new Set([effDir, ...history].filter(Boolean))]
  return (
    <span className="ws-pick" title={title}>
      <Folder size={13} className="ws-pick-ico" />
      <Dropdown
        align={align}
        direction={direction}
        searchPlaceholder={seen.length > 4 ? 'Search workspaces…' : ''}
        value={effDir}
        onChange={(v) => (v === '__browse__' ? onBrowse() : onPick(v))}
        options={[
          ...seen.map((d) => ({ value: d, label: base(d), hint: d })),
          { header: 'Workspace' },
          { value: '__browse__', label: 'Open from file explorer…' }
        ]}
      />
    </span>
  )
}

function AttachChips({ pending, removePending }) {
  if (!pending.length) return null
  const kb = (n) => (n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)
  return (
    <div className="attach-row">
      {pending.map((a) => (
        <div key={a.id} className="attach-chip" title={a.name}>
          {a.kind === 'image' ? (
            <img src={a.url} alt="" />
          ) : isAudioAtt(a) ? (
            <span className="attach-file-ico"><Music size={15} /></span>
          ) : (
            <span className="attach-file-ico"><FileText size={15} /></span>
          )}
          <span className="attach-meta"><strong>{a.name}</strong><em>{a.kind === 'ref' ? 'workspace' : kb(a.size)}</em></span>
          <button className="attach-x" onClick={() => removePending(a.id)} title="Remove"><X size={11} /></button>
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
        <span className="todo-count">{done}/{todos.length}</span>
        <button className="icon-btn todo-x" onClick={onClose} title="Hide for this session"><X size={12} /></button>
      </div>
      <div className="todo-bar"><i style={{ width: `${pct}%` }} /></div>
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

// Slash picks expand to their template ($ARGUMENTS = the rest of the line)
// and ride a normal prompt turn — no special backend path.
function expandTemplate(template, args) {
  const t = String(template || '')
  if (!t) return null
  if (/\$ARGUMENTS/.test(t)) return t.replace(/\$ARGUMENTS/g, args || '').trim()
  return args ? `${t}\n\n${args}` : t
}

function PromptRail({ messages }) {
  const qs = messages.filter((m) => m.role === 'user' && m.id)
  if (qs.length < 2) return null
  const jump = (id) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  return (
    <div className="prompt-rail">
      {qs.map((q, i) => (
        <div
          key={q.id}
          className={`tick${i === qs.length - 1 ? ' latest' : ''}`}
          onClick={() => jump(q.id)}
          title={`Prompt ${i + 1}`}
        >
          <span className="tip"><span className="tip-n">{i + 1}</span>{q.text}</span>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const { theme, appearance, enterToSend, loaderVariant } = useTheme()
  const loadJSON = (k, fb) => {
    try {
      const v = JSON.parse(localStorage.getItem(k))
      return v ?? fb
    } catch {
      return fb
    }
  }
  const [sessions, setSessions] = useState(() => {
    const s = loadJSON('albert.sessions', null)
    const list = Array.isArray(s) ? s : []
    // One-time migration: drop the shipped mock sessions (s1/s2 without a backend id).
    const kept = list.filter((x) => x.ocId || (x.id !== 's1' && x.id !== 's2'))
    if (kept.length !== list.length) {
      try {
        localStorage.setItem('albert.sessions', JSON.stringify(kept))
      } catch { /* quota */ }
    }
    return kept
  })
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
  const [view, setView] = useState(() => {
    const v = localStorage.getItem('albert.view') || 'study'
    return v === 'explain' || v === 'graph' ? 'study' : v // removed tabs fall back to study
  })
  const [settingsTab, setSettingsTab] = useState('general')
  const upd = useUpdater()
  const updActive = upd.supported && ['available', 'downloading', 'downloaded'].includes(upd.status)
  const openUpdates = () => {
    setSettingsTab('updates')
    setView('settings')
  }
  const [store, setStore] = useState(() => loadJSON('albert.msgs', {}))
  const [input, setInput] = useState('')
  const [workingIds, setWorkingIds] = useState({}) // local session id -> true while its turn runs
  const [tick, setTick] = useState(0) // re-render on token updates
  const tRef = useRef(null)
  const taRef = useRef(null)
  const tokensRef = useRef({}) // ocId -> { input, output, cost }
  const lastTick = useRef(0) // token-tick throttle timestamp
  const activeSession = sessions.find((s) => s.id === active) || null
  // This composer's turn runs (or not) — other sessions can run in parallel.
  const working = !!workingIds[activeSession?.id || active]

  const messages = (activeSession?.id && store[activeSession.id]) || []
  const storeRef = useRef(store)
  storeRef.current = store
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const persistTimer = useRef(null)
  // Debounced disk write: streaming fires updateMsgs per token and the store
  // can hold megabytes (image dataURLs) — never stringify it per keystroke.
  const flushPersist = () => {
    persistTimer.current = null
    try {
      const st = storeRef.current
      const saved = sessionsRef.current.filter((s) => (st[s.id]?.length || 0) > 0 || s.ocId)
      localStorage.setItem('albert.sessions', JSON.stringify(saved))
      const keep = new Set(saved.map((s) => s.id))
      const out = {}
      for (const [k, v] of Object.entries(st)) if (keep.has(k)) out[k] = v
      localStorage.setItem('albert.msgs', JSON.stringify(out))
    } catch { /* quota: keep in memory */ }
  }
  const schedulePersist = () => {
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(flushPersist, 800)
  }
  const updateMsgs = (fn, idOverride) => {
    const key = idOverride || activeSession?.id || active
    if (!key) return
    setStore((prev) => {
      const cur = prev[key] || []
      const next = (typeof fn === 'function' ? fn(cur) : fn).slice(-100)
      if (next === cur) return prev
      return { ...prev, [key]: next }
    })
    schedulePersist()
  }

  // Sessions list changes (new/rename/title/delete) flush soon; the per-token
  // store writes are already debounced by schedulePersist.
  useEffect(() => {
    schedulePersist()
  }, [sessions])

  // Flush pending writes when the window is about to go away.
  useEffect(() => {
    const flush = () => {
      clearTimeout(persistTimer.current)
      flushPersist()
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      clearTimeout(persistTimer.current)
      flushPersist()
    }
  }, [])
  useEffect(() => {
    localStorage.setItem('albert.active', active)
  }, [active])
  useEffect(() => {
    localStorage.setItem('albert.view', view)
  }, [view])

  const stickRef = useRef(true)
  useEffect(() => {
    const el = tRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages, workingIds, view])

  // Composer auto-grow with content, capped like Zeron (76–260px).
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(160, Math.max(36, el.scrollHeight)) + 'px'
  }, [input, view, active])

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
  const [workspace, setWorkspaceState] = useState(() => localStorage.getItem('albert.workspace') || '')
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
  const commitRename = (id, title) => {
    const t = title.trim().slice(0, 60)
    if (t) setSessions((prev) => prev.map((x) => (x.id === id ? { ...x, title: t, renamed: true } : x)))
    setRenaming(null)
  }

  const addToThread = (id) => {
    setCtxMenu(null)
    setActive(id)
    if (view === 'settings') setView('study')
    note('Thread support lands next — this session is marked ready to attach.', id)
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

  const switchView = (v) => {
    setView(v)
  }

  const openSession = (id) => {
    setActive(id)
    if (view === 'settings') setView('study')
  }

  const newSession = () => {
    const id = `s${Date.now()}`
    setSessions((s) => [{ id, title: 'New study session', preview: '…', ws: effDir }, ...s])
    setActive(id)
    if (view === 'settings') setView('study')
  }

  const deleteSession = (id) => {
    const ocId = ocByLocal.current.get(id)
    if (ocId) {
      window.api.opencode
        .deleteSession?.(ocId)
        .catch(() => {})
      ocByLocal.current.delete(id)
    }
    setStore((prev) => {
      const out = { ...prev }
      delete out[id]
      try {
        localStorage.setItem('albert.msgs', JSON.stringify(out))
      } catch { /* quota */ }
      return out
    })
    setSessions((s) => {
      const next = s.filter((x) => x.id !== id)
      if (id === active) setActive(next[0]?.id || null)
      return next
    })
  }

  const liveById = useRef(new Map()) // local session id -> live turn (parallel sessions)
  const ocByLocal = useRef(new Map())
  const { status: ocStatus, models: ocModels, paid: ocPaid, commands: ocCommands, model: ocModel, setModel: setOcModel, refresh: ocRefresh } =
    useOpencode(handleOcEvent)

  function note(text, id) {
    updateMsgs((ms) => [...ms, { id: 'n' + Date.now(), role: 'assistant', text, time: timeNow() }], id)
  }

  // Modes (soul+system packs): main owns them per workspace; the renderer
  // caches the list + active id for the navbar, /mode, and Settings.
  const [modeCfg, setModeCfg] = useState({ activeMode: 'study', modes: [] })
  const applyModesResult = useCallback((p) => {
    if (p) setModeCfg({ activeMode: p.activeMode || 'study', modes: Array.isArray(p.modes) ? p.modes : [] })
    return p
  }, [])
  const refreshModes = useCallback(async () => {
    try {
      const p = await window.api?.opencode?.prompts?.()
      return applyModesResult(p)
    } catch { /* backend offline */ }
    return null
  }, [applyModesResult])
  const setModeId = async (id) => applyModesResult(await window.api.opencode.setMode(id))
  const saveCustomMode = async (payload) => applyModesResult(await window.api.opencode.saveCustomMode(payload))
  const deleteCustomMode = async (id) => applyModesResult(await window.api.opencode.deleteCustomMode(id))
  const activeModeName = (modeCfg.modes.find((m) => m.id === modeCfg.activeMode) || {}).name || 'Study tutor'

  // /mode <id|name> — client-side mode switch, never sent to the model.
  // Bare /mode lists what's available.
  const runModeCommand = async (arg, sid, raw) => {
    updateMsgs((m) => [...m, { id: 'u' + Date.now(), role: 'user', text: raw }], sid)
    setInput('')
    setPending([])
    stickRef.current = true
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
      note(`Switched to **${hit.name}** mode. New turns use its prompts.`)
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
      } else if (pt.type === 'reasoning' && typeof pt.text === 'string' && pt.text) thoughts.push(pt.text)
        else if (pt.type === 'tool') {
          const st = pt.state || {}
          const toolName = String(pt.tool || '').toLowerCase()
          const action = mcpAction(toolName) || TOOL_ACTION[toolName] || 'other'
          const inp = st.input || {}
          const target =
            (typeof inp === 'object' ? inp.filePath || inp.path || inp.dir || inp.pattern || inp.command || inp.cmd || inp.url || '' : '') ||
            st.title ||
            pt.tool ||
            'tool'
          // Structured todos for the live widget (todowrite input or output).
          const pickTodos = (v) => {
            if (Array.isArray(v)) return v
            if (v && typeof v === 'object' && Array.isArray(v.todos)) return v.todos
            return null
          }
          const rawTodos = toolName === 'todowrite' ? pickTodos(st.output ?? st.result ?? st.raw) || pickTodos(st.input) : null
          const tb = {
            key: pt.id,
            kind: 'tool',
            label: (action === 'memory' || action === 'search') && pt.tool.includes('_')
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
                      : { content: String(t.content ?? t.text ?? ''), status: t.status || 'pending', priority: t.priority || 'medium' }
                  )
                  .filter((t) => t.content)
              : null,
            input: fmtPart(st.input, 1500),
            output: fmtPart(st.output ?? st.result ?? st.raw, 4000)
          }
          tools.push(tb)
          blocks.push(tb)
        }
    }
    return { text: texts.join('\n\n'), tools, reasoning: thoughts.join('\n\n'), blocks }
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
    updateMsgs((ms) => ms.map((m) => (m.id === liveId ? { ...m, text, tools, reasoning, blocks } : m)), live.localId)
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
      (ms) => ms.map((m) => (m.id === liveId ? { ...m, text, tools, reasoning, blocks, ...(err ? { text: (text ? text + '\n\n' : '') + err } : {}) } : m)),
      live.localId
    )
    flushPersist()
  }

  // SSE events arrive here from the main-process pump (single subscription).
  async function handleOcEvent(p) {
    if (!p || !p.type) return
    const props = p.properties || {}
    if (p.type === 'session.updated' && props.info?.id) {
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
      if (now - lastTick.current > 1000 || Math.floor((t.input || 0) / 512) !== Math.floor(prevIn / 512)) {
        lastTick.current = now
        setTick((n) => n + 1)
      }
    }
    if (p.type.startsWith('permission')) {
      // Reply echoes (permission.replied/updated) carry no request — ignore.
      if (/repl|resolv|update/i.test(p.type)) return
      const reqId = props.requestID || props.requestId || props.id
      const sid = props.sessionID
      // Full-access mode: approve each request as it arrives. The transcript's
      // tool rows already show what ran, so no card or note is needed.
      if (reqId && sid && [...ocByLocal.current.values()].includes(sid)) {
        try {
          await window.api.opencode.replyPermission(reqId, 'once')
        } catch { /* turn continues without it */ }
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
          await firePrompt(live.localId, live.ocId, live.liveId, live.promptText, live.wireAtts || [], { textOnly: true })
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

  const [pending, setPending] = useState([])
  const [dragging, setDragging] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const attachRef = useRef(null)
  const attachWrapRef = useRef(null)

  const IMG_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
  const toggleRef = (relPath) => {
    const name = relPath.split(/[\\/]/).pop()
    setPending((prev) => {
      if (prev.some((a) => a.kind === 'ref' && a.path === relPath)) {
        return prev.filter((a) => !(a.kind === 'ref' && a.path === relPath))
      }
      if (prev.length >= 5) {
        note('Attachment limit is 5 per message.')
        return prev
      }
      return [...prev, { id: 'r' + Date.now() + Math.random().toString(16).slice(2), kind: 'ref', path: relPath, name, size: 0 }]
    })
  }

  const readAsText = (f) =>
    new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result || ''))
      r.onerror = rej
      r.readAsText(f)
    })
  const readAsDataURL = (f) =>
    new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result || ''))
      r.onerror = rej
      r.readAsDataURL(f)
    })
  const downscaleImage = (f) =>
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
  const TEXT_EXTS = ['txt', 'md', 'markdown', 'js', 'jsx', 'ts', 'tsx', 'json', 'css', 'html', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'yml', 'yaml', 'toml', 'csv', 'log', 'sql', 'xml', 'svg']
  const addFiles = async (list) => {
    const files = [...(list || [])]
    if (!files.length) return
    let room = 5 - pending.length
    for (const f of files) {
      if (room <= 0) {
        note('Attachment limit is 5 per message.')
        break
      }
      const ext = (f.name.split('.').pop() || '').toLowerCase()
      const isPdf = f.type === 'application/pdf' || ext === 'pdf'
      try {
        if (f.type.startsWith('image/') && !isPdf) {
          if (f.size > 8 * 1024 * 1024) {
            note(`Skipped ${f.name}: images must be under 8MB.`)
            continue
          }
          let url = null
          let mime = 'image/jpeg'
          try {
            url = await downscaleImage(f)
          } catch {
            // Canvas decode failed (e.g. HEIC bytes in a .jpg, corrupt file):
            // fall back to the original bytes and let the model decide.
            if (f.size > 12 * 1024 * 1024) {
              note(`Skipped ${f.name}: the image could not be processed and is over 12MB.`)
              continue
            }
            try {
              url = await readAsDataURL(f)
              mime = f.type || 'image/jpeg'
            } catch {
              note(`Could not read ${f.name}.`)
              continue
            }
          }
          const item = { id: 'a' + Date.now() + Math.random().toString(16).slice(2), name: f.name, size: f.size, kind: 'image', mime, url }
          setPending((p) => [...p, item])
          room--
        } else if (isPdf) {
          if (f.size > 10 * 1024 * 1024) {
            note(`Skipped ${f.name}: PDFs must be under 10MB.`)
            continue
          }
          const url = await readAsDataURL(f)
          const item = { id: 'a' + Date.now() + Math.random().toString(16).slice(2), name: f.name, size: f.size, kind: 'pdf', mime: 'application/pdf', url, path: f.path || '' }
          setPending((p) => [...p, item])
          room--
        } else if (f.type.startsWith('audio/') || AUDIO_EXTS.includes(ext)) {
          if (f.size > 20 * 1024 * 1024) {
            note(`Skipped ${f.name}: audio files must be under 20MB.`)
            continue
          }
          const url = await readAsDataURL(f)
          const item = { id: 'a' + Date.now() + Math.random().toString(16).slice(2), name: f.name, size: f.size, kind: 'audio', mime: f.type || 'audio/mpeg', url }
          setPending((p) => [...p, item])
          room--
        } else if (f.type.startsWith('text/') || TEXT_EXTS.includes(ext)) {
          if (f.size > 256 * 1024) {
            note(`Skipped ${f.name}: text files must be under 256KB.`)
            continue
          }
          const raw = await readAsText(f)
          const item = { id: 'a' + Date.now() + Math.random().toString(16).slice(2), name: f.name, size: f.size, kind: 'text', text: raw.slice(0, 12000) }
          setPending((p) => [...p, item])
          room--
        } else {
          note(`Skipped ${f.name}: only images, PDFs, audio and text files for now.`)
        }
      } catch {
        note(`Could not read ${f.name}.`)
      }
    }
  }
  const removePending = (id) => setPending((p) => p.filter((x) => x.id !== id))
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

  // Component scope (handleOcEvent's retry path needs it too): starts a turn —
  // registers the live state, appends the placeholder, fires prompt_async.
  const firePrompt = async (sid, ocId, liveId, text, wireAtts, opts = {}) => {
    liveById.current.set(sid, { ocId, liveId, localId: sid, parts: new Map(), userMsgIds: new Set(), promptText: text, wireAtts, retriedTextOnly: !!opts.textOnly })
    if (!opts.reusePlaceholder) {
      updateMsgs((m) => [...m, { id: liveId, role: 'assistant', text: '', tools: [], time: timeNow() }], sid)
    }
    await window.api.opencode.prompt(ocId, ocModel, text || '(see attached files)', wireAtts, variant || '', !!opts.textOnly)
  }

  const send = async () => {
    const text = input.trim()
    // Hero send with no session yet: mint a real one first, so even
    // offline notes have a conversation to land in.
    let sid = activeSession?.id || active
    if (!sid || !sessions.some((x) => x.id === sid)) {
      sid = `s${Date.now()}`
      const entry = { id: sid, title: 'New study session', preview: (text || '…').slice(0, 48), ws: effDir }
      setSessions((prev) => [entry, ...prev])
      setActive(sid)
    }
    if ((!text && !pending.length) || workingIds[sid]) return
    const fail = (msg) => note(msg, sid)
    if (!ocStatus.running) {
      fail('The tutor backend is offline. It starts with the app when `opencode` is on PATH; if no provider is logged in, run `opencode auth login` in a terminal, then retry.')
      return
    }
    if (!ocStatus.connected?.length) {
      fail('No AI provider is logged in. Run `opencode auth login` in a terminal (OpenRouter has free models), then retry.')
      return
    }
    // /mode never reaches the model — it switches the prompt pack locally.
    const modeMatch = text.match(/^\/mode(?:\s+(\S[\s\S]*))?$/i)
    if (modeMatch) {
      await runModeCommand((modeMatch[1] || '').trim(), sid, text)
      return
    }
    const qid = 'u' + Date.now()
    const liveId = 'a' + qid
    const atts = pending
    // Slash pick (/review args…): the tag expands to the command template and
    // rides a normal prompt turn — the bubble keeps what you typed.
    const cmdParse = text.match(/^\/([A-Za-z0-9_-]+)\s*([\s\S]*)$/)
    const knownCmd = cmdParse && ocCommands.find((c) => c.name === cmdParse[1])
    const cmdArgs = knownCmd ? (cmdParse[2] || '').trim() : ''
    const sendText = knownCmd ? expandTemplate(knownCmd.template, cmdArgs) || text : text
    const shownText = text || atts.map((a) => a.name).join(', ')
    const sentAtts = atts.map((a) => ({ ...a }))
    const modelCap = modelDef?.attachment
    const needsAttachment = (a) =>
      a.kind === 'image' ||
      a.kind === 'pdf' ||
      (a.kind === 'ref' && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'pdf'].includes((a.path.split('.').pop() || '').toLowerCase()))
    if (atts.some(needsAttachment) && ocModels.length && !modelCap) {
      fail(`\`${ocModel.modelID}\` can't take images or PDFs. Pick an attachment-capable model or remove the file.`)
      return
    }
    updateMsgs((m) => [...m, { id: qid, role: 'user', text: shownText, attachments: sentAtts }], sid)
    setInput('')
    setPending([])
    stickRef.current = true
    setWorkingIds((prev) => ({ ...prev, [sid]: true }))
    setSessions((s) =>
      s.map((x) => {
        if (x.id !== sid) return x
        const title = x.preview && x.preview !== '…' ? x.title : shownText.split(/\s+/).slice(0, 5).join(' ').slice(0, 40) || 'New study session'
        return { ...x, title, preview: shownText.slice(0, 48) }
      })
    )
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
    // After the 3rd user message, let the model name the session (unless renamed).
    const userCount = messages.filter((m) => m.role === 'user').length + 1
    const entry0 = sessions.find((x) => x.id === sid)
    if (userCount === 3 && entry0 && !entry0.renamed && ocStatus.running) {
      const snippet = [...messages.filter((m) => m.role === 'user').map((m) => m.text), text].slice(0, 3).join('\n').slice(0, 500)
      window.api.opencode
        .title(snippet, ocModel)
        .then((t) => {
          if (!t) return
          setSessions((prev) => prev.map((x) => (x.id === sid && !x.renamed ? { ...x, title: t } : x)))
        })
        .catch(() => {})
    }
    try {
      let ocId = ocByLocal.current.get(sid)
      if (!ocId) {
        const fetched = sessions.find((x) => x.id === sid)?.ocId
        if (fetched) {
          ocId = fetched
          ocByLocal.current.set(sid, ocId)
        }
      }
      if (!ocId) {
        const s = await window.api.opencode.createSession(activeSession?.title || 'Study session')
        ocId = s.id
        ocByLocal.current.set(sid, ocId)
        setSessions((prev) => prev.map((x) => (x.id === sid ? { ...x, ocId } : x)))
      }
      try {
        await firePrompt(sid, ocId, liveId, sendText, wireAtts)
      } catch (e) {
        // Server forgot the session (data dir wiped / another profile): start fresh once.
        if (/not found|404|no session/i.test(e.message || '')) {
          ocByLocal.current.delete(sid)
          setSessions((prev) => prev.map((x) => (x.id === sid ? { ...x, ocId: undefined } : x)))
          const s = await window.api.opencode.createSession(activeSession?.title || 'Study session')
          ocId = s.id
          ocByLocal.current.set(sid, ocId)
          setSessions((prev) => prev.map((x) => (x.id === sid ? { ...x, ocId } : x)))
          updateMsgs((m) => m.filter((x) => x.id !== liveId), sid)
          await firePrompt(sid, ocId, liveId, sendText, wireAtts)
        } else {
          throw e
        }
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

  const stopTurn = async () => {
    const sid = activeSession?.id || active
    const live = liveById.current.get(sid)
    if (!live) return
    try {
      await window.api.opencode.abort(live.ocId)
    } catch { /* finalize regardless */ }
    finishLive('(stopped)', live)
  }

  // Slash-command autocomplete: `/` + prefix at message start, like the TUI.
  const [cmdSel, setCmdSel] = useState(0)
  const [cmdDismissed, setCmdDismissed] = useState('')
  const cmdMatch = input.match(/^\/([A-Za-z0-9_-]*)$/)
  const cmdFiltered = cmdMatch
    ? ocCommands.filter((c) => c.name.toLowerCase().startsWith(cmdMatch[1].toLowerCase()))
    : []
  const cmdOpen = !!cmdMatch && cmdFiltered.length > 0 && input !== cmdDismissed
  const completeCmd = (name) => {
    if (!name) return
    setInput(`/${name} `)
    setCmdSel(0)
  }
  // Staged command tag: `/name args…` with following text becomes a chip that
  // expands to the command template on send.
  const tagParse = input.match(/^\/([A-Za-z0-9_-]+)\s+([\s\S]*)$/)
  const tagCmd = tagParse && ocCommands.find((c) => c.name === tagParse[1])
  const untag = () => setInput(input.replace(/^\/[A-Za-z0-9_-]+\s+/, ''))

  const onKey = (e) => {
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
    if (e.key === 'Escape' && working && !pickerOpen && !ctxMenu) {
      e.preventDefault()
      stopTurn()
      return
    }
    const sendKey = enterToSend ? e.key === 'Enter' && !e.shiftKey : e.key === 'Enter' && (e.ctrlKey || e.metaKey)
    if (sendKey) { e.preventDefault(); send() }
  }

  // Clipboard images paste straight in as attachments; plain text pastes normally.
  const onPasteImage = (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    addFiles(files)
  }

  const visible = sessions.filter((s) => (s.title + s.preview).toLowerCase().includes(query.toLowerCase()))
  const toggleWs = (dir) =>
    setCollapsedWs((prev) => {
      const next = prev.includes(dir) ? prev.filter((d) => d !== dir) : [...prev, dir]
      try {
        localStorage.setItem('albert.wsCollapsed', JSON.stringify(next))
      } catch { /* private mode */ }
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
      } catch { /* private mode */ }
      return next
    })
  const activeOcId = ocByLocal.current.get(active) || activeSession?.ocId
  // Restore the saved workspace once the backend is up.
  useEffect(() => {
    if (!ocStatus.running || wsSynced.current) return
    wsSynced.current = true
    refreshModes()
    const want = localStorage.getItem('albert.workspace') || ''
    if (want && want !== ocStatus.workspace) {
      window.api.opencode.setWorkspace(want).then(() => ocRefresh()).catch(() => {})
    }
  }, [ocStatus.running, refreshModes])

  // One-time migration: sessions saved before workspace stamping get their
  // real directory from the server, so a fresh workspace starts empty.
  const wsMigrated = useRef(false)
  useEffect(() => {
    if (!ocStatus.running || wsMigrated.current) return
    wsMigrated.current = true
    ;(async () => {
      const missing = sessionsRef.current.filter((s) => !s.ws && s.ocId)
      if (!missing.length) return
      const updates = {}
      for (const s of missing) {
        try {
          const info = await window.api.opencode.sessionGet(s.ocId)
          if (info?.directory) updates[s.id] = info.directory
        } catch { /* stays unstamped */ }
      }
      if (Object.keys(updates).length) {
        setSessions((prev) => prev.map((x) => (updates[x.id] ? { ...x, ws: updates[x.id] } : x)))
      }
    })()
  }, [ocStatus.running])

  const effDir = workspace || ocStatus.workspace || ''
  const folderName = effDir.split(/[\\/]/).filter(Boolean).pop() || ''
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
      } catch { /* private mode */ }
      return next
    })
    setCtxMenu(null)
  }
  const wsHistory = useMemo(() => [...new Set(sessions.map((s) => s.ws).filter(Boolean))], [sessions])
  // Threads: sessions grouped by workspace — pinned groups first (pin order),
  // then the current workspace, then the rest alphabetically. Unstamped
  // leftovers (pre-tracking, no backend id) live under Previous last —
  // never under the current workspace, so fresh folders start empty.
  const groups = useMemo(() => {
    const map = new Map()
    for (const s of visible) {
      const key = s.ws || '__previous__'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
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
  }, [visible, effDir, pinnedWs])

  const pickWorkspace = async () => {
    let dir = null
    try {
      dir = await window.api.opencode.pickFolder()
    } catch {
      return
    }
    if (dir) switchWorkspaceDir(dir)
  }

  const switchWorkspaceDir = async (dir, opts = {}) => {
    if (!dir) return
    try {
      await window.api.opencode.setWorkspace(dir)
      localStorage.setItem('albert.workspace', dir)
      setWorkspaceState(dir)
      // Old backend-session mappings belong to the previous workspace.
      ocByLocal.current.clear()
      tokensRef.current = {}
      setTick((n) => n + 1)
      if (opts.keepGroups) {
        // New-session path: leave every other group exactly as it is, just
        // make sure the target group is visible.
        setCollapsedWs((prev) => {
          if (!prev.includes(dir)) return prev
          const next = prev.filter((d) => d !== dir)
          try {
            localStorage.setItem('albert.wsCollapsed', JSON.stringify(next))
          } catch { /* private mode */ }
          return next
        })
      } else {
        // Manual switch: land directly in this workspace's thread — expand
        // only its group and activate its most recent session (or the empty
        // hero for a fresh one).
        const mine = sessionsRef.current.filter((s) => s.ws === dir)
        const others = new Set(sessionsRef.current.map((s) => s.ws).filter((w) => w && w !== dir))
        setCollapsedWs([...others])
        try {
          localStorage.setItem('albert.wsCollapsed', JSON.stringify([...others]))
        } catch { /* private mode */ }
      if (!opts.keepActive) {
          if (mine.length) {
            setActive(mine[0].id)
          } else {
            // Fresh workspace: mint its first thread immediately so choosing
            // a folder never lands on an empty hero.
            const id = `s${Date.now()}`
            setSessions((s) => [{ id, title: 'New study session', preview: '…', ws: dir }, ...s])
            setActive(id)
            if (view === 'settings') setView('study')
          }
        }
      }
      ocRefresh()
      refreshModes()
    } catch (e) {
      note(`Could not switch workspace: ${e.message || e}`, activeSession?.id || active)
    }
  }

  const newSessionIn = async (dir) => {
    const id = `s${Date.now()}`
    const target = dir || effDir
    // Stamped once with the target workspace — nothing re-stamps it later,
    // so the session lives in exactly one workspace group.
    setSessions((s) => [{ id, title: 'New study session', preview: '…', ws: target }, ...s])
    setActive(id)
    if (view === 'settings') setView('study')
    if (dir && dir !== effDir) await switchWorkspaceDir(dir, { keepGroups: true, keepActive: true })
  }

  // Backfill token usage when opening a session that already ran server-side.
  useEffect(() => {
    if (!activeOcId || tokensRef.current[activeOcId] || !ocStatus.running) return
    window.api.opencode
      .sessionGet(activeOcId)
      .then((info) => {
        if (info?.tokens) {
          tokensRef.current[activeOcId] = { input: info.tokens.input || 0, output: info.tokens.output || 0, cost: info.cost || 0 }
          setTick((n) => n + 1)
        }
      })
      .catch(() => {})
  }, [activeOcId, ocStatus.running])
  const modelDef =
    ocModels.find((m) => m.providerID === ocModel.providerID && m.modelID === ocModel.modelID) ||
    ocPaid.find((m) => m.providerID === ocModel.providerID && m.modelID === ocModel.modelID)
  const modelLimit = modelDef?.limit || 0
  const tok = (activeOcId && tokensRef.current[activeOcId]) || null
  const ctxPct = tok && modelLimit > 0 ? Math.min(99, Math.max(1, Math.round((tok.input / modelLimit) * 100))) : Math.min(99, 1 + messages.length)
  const ctxTitle = tok
    ? `${tok.input.toLocaleString()} / ${(modelLimit || 0).toLocaleString()} input tokens · $${Number(tok.cost || 0).toFixed(4)}`
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
  const showTodos = latestTodos && todoHiddenFor !== (activeSession?.id || active)
  const isHero = (view === 'study' || view === 'quiz') && messages.length === 0 && !working
  const thinkLevels = modelDef?.variants || []
  const vKey = `albert.variant.${ocModel.providerID}/${ocModel.modelID}`
  const [variant, setVariantState] = useState('')
  // Reload the saved level whenever the model (or its catalog entry) changes;
  // drop it if the new model doesn't offer that level.
  useEffect(() => {
    let saved = ''
    try {
      saved = localStorage.getItem(vKey) || ''
    } catch { /* private mode */ }
    setVariantState(thinkLevels.includes(saved) ? saved : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vKey, ocModels.length])
  const setVariant = (v) => {
    setVariantState(v)
    try {
      localStorage.setItem(vKey, v)
    } catch { /* private mode */ }
  }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
  const modelPicker = (
    <span className="model-badge" title={ocStatus.running ? `${ocModels.length} free${ocPaid.length ? ` + ${ocPaid.length} paid` : ''} models available` : 'Tutor backend offline'}>
      <Dropdown
        direction="up"
        searchPlaceholder="Search models…"
        value={modelKey(ocModel)}
        onChange={(v) => {
          const i = v.indexOf('/')
          if (i > 0) setOcModel({ providerID: v.slice(0, i), modelID: v.slice(i + 1) })
        }}
        options={[
          ...ocModels.map((m) => ({ value: modelKey(m), label: m.name + (FAST_MODELS.has(modelKey(m)) ? ' · Fast' : ''), hint: m.providerID })),
          ...(ocPaid.length ? [{ header: 'Paid · billed to your keys' }] : []),
          ...ocPaid.map((m) => ({ value: modelKey(m), label: m.name, hint: `${m.providerID} · paid` }))
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
        options={[{ value: '', label: 'Default' }, ...thinkLevels.map((l) => ({ value: l, label: cap(l) }))]}
      />
    </span>
  ) : null

  return (
    <div className="shell">
      {isHero ? (
        <HeroChrome onTogglePanel={toggleSide} />
      ) : (
        <Navbar
          view={view}
          setView={switchView}
          sideOpen={sideOpen}
          onTogglePanel={toggleSide}
          sessionLabel={activeSession ? activeSession.title : 'alfred'}
          modeLabel={activeModeName}
          onNew={newSession}
        />
      )}
      <div className="content">
        {sideOpen && (
          <aside className="sidebar">
            <div className="side-search">
              <Search size={13} />
              <input type="text" placeholder="Search sessions…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <button className="search-clear" title="Clear" onClick={() => setQuery('')}>
                  <X size={11} />
                </button>
              )}
            </div>
            <div className="side-new">
              <button className="btn ghost hoverable wide" onClick={newSession}>+ New session</button>
            </div>
            <div className="side-list scroll-fade">
              {groups.map(([dir, list]) => {
                const shut = collapsedWs.includes(dir)
                const isPrev = dir === '__previous__'
                const name = isPrev ? 'Previous sessions' : dir.split(/[\\/]/).filter(Boolean).pop() || dir
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
                      title={isPrev ? 'Sessions from before workspace tracking — right-click for color' : `${dir} — right-click for color`}
                      style={tint ? { background: `color-mix(in srgb, ${tint} 14%, transparent)` } : undefined}
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
                      <Folder size={13} style={tint ? { color: tint } : undefined} />
                      <span className="ws-name">{name}</span>
                      {pinned && (
                        <button
                          className="ws-pin"
                          title="Pinned to top — click to unpin"
                          onClick={(e) => {
                            e.stopPropagation()
                            togglePin(dir)
                          }}
                        >
                          <Pin size={11} />
                        </button>
                      )}
                      <span className="ws-count">{list.length}</span>
                      {!isPrev && (
                        <button
                          className="ws-new"
                          title={`New session in ${name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            newSessionIn(dir)
                          }}
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                    {!shut &&
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
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{s.preview}</div>
                            </div>
                          )}
                          {workingIds[s.id] && <span className="run-dot" title="Running" />}
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
                      ))}
                    </div>
                  )
                })}
              {visible.length === 0 && (
                <div className="side-empty">
                  {sessions.length === 0 ? 'No sessions yet — ask anything to start one.' : 'No sessions match.'}
                </div>
              )}
              </div>
              <div className="side-foot">
              {updActive && (
                <button
                  className={`upd-banner ${upd.status}`}
                  onClick={openUpdates}
                  title={upd.status === 'downloaded' ? 'Open Updates to restart and install' : `Update available${upd.latest ? ` (v${upd.latest})` : ''} — open Updates`}
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
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{appearance} · {theme.isGlass ? 'glass' : 'opaque'}</span>
              <button className={`icon-btn ${view === 'settings' ? 'on' : ''}`} onClick={() => { setSettingsTab('general'); setView('settings') }} title="Settings"><SettingsIcon size={14} /></button>
              </div>
            </div>
          </aside>
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
                    <button className="hero-sel" title="This device — single-device mode"><Monitor size={13} /> {(ocStatus.hostname || 'This PC').toUpperCase()} <ChevronDown size={12} /></button>
                    <WorkspacePicker effDir={effDir} history={wsHistory} onPick={switchWorkspaceDir} onBrowse={pickWorkspace} title={effDir || 'Choose workspace folder'} />
                  </div>
                  <AttachChips pending={pending} removePending={removePending} />
                  {tagCmd && (
                    <div className="cmd-tag-row">
                      <span className="cmd-tag">/{tagCmd.name}<button onClick={untag} title="Remove tag"><X size={11} /></button></span>
                    </div>
                  )}
                  <div className={`hero-composer${dragging ? ' dragging' : ''}`} {...dropProps}>
                    {cmdOpen && (
                      <CommandMenu commands={cmdFiltered} selected={cmdSel} onPick={completeCmd} onHover={setCmdSel} />
                    )}
                    <textarea
                      ref={taRef}
                      rows={2} value={input} placeholder="Do anything…"
                      spellCheck={false} autoCorrect="off" autoCapitalize="off"
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKey}
                      onPaste={onPasteImage}
                    />
                    <div className="hero-composer-row">
                      <span className="attach-wrap" ref={attachWrapRef}>
                        <button className="icon-btn" title="Attach files" onClick={() => setPickerOpen((o) => !o)}><Paperclip size={15} /></button>
                        <AttachPicker wrapRef={attachWrapRef} open={pickerOpen} staged={pending} onToggle={toggleRef} onUpload={() => { setPickerOpen(false); attachRef.current?.click() }} onClose={() => setPickerOpen(false)} />
                      </span>
                      <input ref={attachRef} type="file" multiple accept="image/*,audio/*,.pdf,.mp3,.wav,.ogg,.m4a,.txt,.md,.js,.jsx,.ts,.tsx,.json,.css,.html,.py,.csv,.log" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
                      {modelPicker}
                      {thinkPicker}
                      <span style={{ flex: 1 }} />
                      <button className={`send-round${working ? ' stop' : ''}`} onClick={working ? stopTurn : send} title={working ? 'Stop (Esc)' : 'Send'}><ArrowUp size={16} strokeWidth={2.4} /></button>
                    </div>
                  </div>
                  <div className="hero-meta">
                    <WorkspacePicker effDir={effDir} history={wsHistory} onPick={switchWorkspaceDir} onBrowse={pickWorkspace} title={effDir ? `${folderName} checkout` : 'Choose workspace folder'} />
                    <span className="ctx-item"><GitBranch size={12} /> {ocStatus.gitBranch || '—'} <ChevronDown size={11} /></span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {showTodos && (
                <TodoWidget todos={latestTodos} onClose={() => setTodoHiddenFor(activeSession?.id || active)} />
              )}
              <div className={`transcript-wrap${showRail ? ' with-rail' : ''}`}>
                <div
                  className="transcript"
                  ref={tRef}
                  onScroll={(e) => {
                    const el = e.currentTarget
                    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
                  }}
                >
                  <div className="col">
                    {messages.map((m, i) => {
                      const liveId = [...liveById.current.values()].find((l) => l.localId === (activeSession?.id || active))?.liveId
                      return <MemoMsg key={m.id ?? i} m={m} onPreview={setPreview} onQuestion={answerQuestion} qReq={qReq} live={!!liveId && m.id === liveId} />
                    })}
                    {working && (
                      <div className="msg-ai">
                        <LoadingState variant={loaderVariant} label="Thinking" />
                      </div>
                    )}
                  </div>
                </div>
                <PromptRail messages={messages} />
              </div>
              <div className="composer-wrap">
                <div className="col">
                  <AttachChips pending={pending} removePending={removePending} />
                  {tagCmd && (
                    <div className="cmd-tag-row">
                      <span className="cmd-tag">/{tagCmd.name}<button onClick={untag} title="Remove tag"><X size={11} /></button></span>
                    </div>
                  )}
                  <div className={`composer2${dragging ? ' dragging' : ''}`} {...dropProps}>
                    {cmdOpen && (
                      <CommandMenu commands={cmdFiltered} selected={cmdSel} onPick={completeCmd} onHover={setCmdSel} />
                    )}
                    <span className="attach-wrap" ref={attachWrapRef}>
                      <button className="icon-btn" title="Attach files" onClick={() => setPickerOpen((o) => !o)}><Paperclip size={15} /></button>
                      <AttachPicker wrapRef={attachWrapRef} open={pickerOpen} staged={pending} onToggle={toggleRef} onUpload={() => { setPickerOpen(false); attachRef.current?.click() }} onClose={() => setPickerOpen(false)} />
                    </span>
                    <input ref={attachRef} type="file" multiple accept="image/*,audio/*,.pdf,.mp3,.wav,.ogg,.m4a,.txt,.md,.js,.jsx,.ts,.tsx,.json,.css,.html,.py,.csv,.log" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
                    <textarea
                      ref={taRef}
                      rows={1} value={input} placeholder="Do anything…"
                      spellCheck={false} autoCorrect="off" autoCapitalize="off"
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKey}
                      onPaste={onPasteImage}
                    />
                    {modelPicker}
                    {thinkPicker}
                    <button className={`send-round${working ? ' stop' : ''}`} onClick={working ? stopTurn : send} title={working ? 'Stop (Esc)' : 'Send'}><ArrowUp size={16} strokeWidth={2.4} /></button>
                  </div>
                  <div className="ctx-row">
                    <WorkspacePicker effDir={effDir} history={wsHistory} onPick={switchWorkspaceDir} onBrowse={pickWorkspace} direction="up" align="left" title={effDir || 'Choose workspace folder'} />
                    <span className="ctx-item"><GitBranch size={12} /> {ocStatus.gitBranch || '—'}</span>
                    <span
                      className={`conn${ocStatus.running ? ' on' : ''}`}
                      title={ocStatus.running ? `opencode ${ocStatus.version || ''} · ${(ocStatus.connected || []).join(', ')}` : 'Tutor backend offline — click to retry'}
                      onClick={() => ocRefresh()}
                    >
                      <i />
                      {ocStatus.running
                        ? (ocStatus.connected?.length ? `opencode ${ocStatus.version || ''}` : 'no provider login')
                        : 'opencode offline'}
                    </span>
                    <span className="ctx-right" title={ctxTitle}>◔ {ctxPct}%</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        {preview && <PreviewPane att={preview} onClose={() => setPreview(null)} />}
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
                  <Pin size={13} /> {pinnedWs.includes(ctxMenu.ws) ? 'Unpin from top' : 'Pin to top'}
                </div>
              )}
              <div className="ctx-menu-label">
                Thread color · {(ctxMenu.ws === '__previous__' ? 'Previous sessions' : ctxMenu.ws.split(/[\\/]/).filter(Boolean).pop() || ctxMenu.ws)}
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
              <div className="ctx-menu-item" onClick={() => addToThread(ctxMenu.id)}>
                <MessagesSquare size={13} /> Add to thread
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


