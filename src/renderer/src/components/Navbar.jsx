import { ArrowLeft, ArrowRight, Minus, PanelLeft, PanelRight, Plus, Box, Square, X } from 'lucide-react'

const send = (ch) => {
  if (window.api?.window) {
    if (ch === 'window-minimize') window.api.window.minimize()
    if (ch === 'window-maximize') window.api.window.maximize()
    if (ch === 'window-close') window.api.window.close()
    return
  }
  window.electron?.ipcRenderer?.send(ch)
}

const I = { size: 15, strokeWidth: 1.8 }

const isMacOS = () =>
  typeof navigator !== 'undefined' &&
  (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase().includes('mac')

export function WinControls() {
  if (isMacOS()) return null
  return (
    <span className="win-controls">
      <button className="wc" onClick={() => send('window-minimize')} title="Minimize"><Minus size={13} /></button>
      <button className="wc" onClick={() => send('window-maximize')} title="Maximize"><Square size={11} /></button>
      <button className="wc danger" onClick={() => send('window-close')} title="Close"><X size={14} /></button>
    </span>
  )
}

// Floating pre-message chrome: nav pill left, window controls right, no bar.
export function HeroChrome({ onTogglePanel }) {
  return (
    <div className="hero-chrome">
      <div className="nav-pill">
        <button className="nbtn" onClick={onTogglePanel} title="Open sidebar"><PanelLeft {...I} /></button>
        <button className="nbtn dim" title="Back"><ArrowLeft {...I} /></button>
        <button className="nbtn dim" title="Forward"><ArrowRight {...I} /></button>
      </div>
      <WinControls />
    </div>
  )
}

export default function Navbar({ view, setView, sideOpen, onTogglePanel, sessionLabel, modeLabel, onNew }) {
  const tabs = [
    { id: 'study', label: 'Study' },
    { id: 'quiz', label: 'Quiz' }
  ]

  return (
    <header className="navbar">
      <div className="nav-left">
        <button className="nbtn" onClick={onTogglePanel} title="Toggle sidebar"><PanelLeft {...I} /></button>
        <button className="nbtn dim" title="Back"><ArrowLeft {...I} /></button>
        <button className="nbtn dim" title="Forward"><ArrowRight {...I} /></button>
        <button className="nbtn" onClick={onNew} title="New session"><Plus {...I} /></button>
        <span className="proj-chip" title="Active session">
          <Box size={13} strokeWidth={1.8} className="proj-ico" />
          <strong>{sessionLabel || 'alfred'}</strong>
          <span className="proj-ctx">alfred @ student</span>
        </span>
      </div>

      <nav className="nav-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`nav-tab ${view === t.id ? 'on' : ''}`} onClick={() => setView(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="nav-right">
        <span className="mode-chip" title="Active mode — switch in Settings → Modes, or with /mode">{modeLabel || 'Study tutor'}</span>
        <button className="nbtn" onClick={onTogglePanel} title="Toggle panel"><PanelRight {...I} /></button>
        <WinControls />
      </div>
    </header>
  )
}
