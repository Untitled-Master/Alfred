import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import Dropdown from './Dropdown'
import { useTheme } from '../theme/ThemeContext'
import { ACCENTS } from '../theme/tokens'

const readAsDataURL = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })

const downscaleDataUrl = (dataUrl) =>
  new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      try {
        const max = 1920
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.width * scale))
        c.height = Math.max(1, Math.round(img.height * scale))
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        res(c.toDataURL('image/jpeg', 0.82))
      } catch (e) {
        rej(e)
      }
    }
    img.onerror = rej
    img.src = dataUrl
  })

function Row({ label, hint, children }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <div className="set-title">{label}</div>
        {hint && <div className="set-hint">{hint}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Segmented({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={`seg-btn ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Stepper({ value, min, max, step = 1, onChange, unit = 'px' }) {
  return (
    <div className="stepper">
      <button className="step-btn" onClick={() => onChange(Math.max(min, value - step))}>–</button>
      <span className="step-val">{value}{unit}</span>
      <button className="step-btn" onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  )
}

function Switch({ value, onChange }) {
  return (
    <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span className="knob" />
    </button>
  )
}

function PromptEditor({ title, hint, value, onChange, onSave, onReset, showReset, customized, status, busy }) {
  return (
    <section className="set-card">
      <h2>{title}{customized && <span className="prompt-badge">customized</span>}</h2>
      <p className="prompt-hint">{hint}</p>
      <textarea className="prompt-edit" value={value ?? ''} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      <div className="prompt-actions">
        <button className="btn accent" onClick={onSave} disabled={busy}>Save</button>
        {showReset !== false && <button className="btn ghost" onClick={onReset} disabled={busy}>Reset to default</button>}
        {status && <span className="prompt-status">{status}</span>}
      </div>
    </section>
  )
}

function ModesTab({ modes, activeMode, onActivateMode, onSaveCustomMode, onDeleteCustomMode, status, setStatus }) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null) // null | { id, name, soul, system }

  const activate = async (id) => {
    if (busy || id === activeMode) return
    setBusy(true)
    setStatus('')
    try {
      await onActivateMode(id)
      setStatus('Mode switched — Soul/System tabs now edit it.')
    } catch (e) {
      setStatus(`Could not switch mode: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const name = (editing.name || '').trim()
    if (!name) {
      setStatus('Give the mode a name first.')
      return
    }
    if (!(editing.soul || '').trim() && !(editing.system || '').trim()) {
      setStatus('Give the mode a soul or a system prompt (or both).')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      await onSaveCustomMode({ id: editing.id || undefined, name, soul: editing.soul, system: editing.system })
      setEditing(null)
      setStatus('Custom mode saved.')
    } catch (e) {
      setStatus(`Could not save: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const del = async (m) => {
    if (!window.confirm(`Delete the "${m.name}" mode?`)) return
    setBusy(true)
    setStatus('')
    try {
      await onDeleteCustomMode(m.id)
      setStatus('Custom mode deleted.')
    } catch (e) {
      setStatus(`Could not delete: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setEditing((prev) => ({ ...prev, [k]: e.target.value }))

  return (
    <>
      <section className="set-card">
        <h2>Modes</h2>
        <p className="prompt-hint">A mode is a soul + system prompt pack. The Soul/System tabs edit whichever mode is active. Switch here, or in chat with <code>/mode &lt;id&gt;</code>.</p>
        {modes.length ? (
          <div className="mode-list">
            {modes.map((m) => (
              <div key={m.id} className={`mode-row${m.id === activeMode ? ' on' : ''}`} onClick={() => activate(m.id)} title={m.id === activeMode ? 'Active mode' : `Switch to ${m.name}`}>
                <span className={`mode-dot${m.id === activeMode ? ' on' : ''}`} />
                <span className="mode-name">{m.name}</span>
                <span className="mode-id">{m.id}</span>
                {!m.builtin && <span className="prompt-badge">custom</span>}
                {!m.builtin && (
                  <span className="mode-row-btns">
                    <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setEditing({ id: m.id, name: m.name, soul: m.soul, system: m.system }) }}>
                      <Pencil size={12} />
                    </button>
                    <button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); del(m) }}>
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="prompt-status">Loading modes… (is the backend online?)</div>
        )}
        {status && <div className="prompt-status">{status}</div>}
      </section>
      {editing ? (
        <section className="set-card">
          <h2>{editing.id ? 'Edit custom mode' : 'New custom mode'}</h2>
          <input className="mode-name-input" placeholder="Name — e.g. Exam coach" value={editing.name} onChange={set('name')} maxLength={60} />
          <p className="prompt-hint">Soul — who this mode is.</p>
          <textarea className="prompt-edit small" value={editing.soul} onChange={set('soul')} spellCheck={false} placeholder="You are Alfred, …" />
          <p className="prompt-hint">System — how it behaves.</p>
          <textarea className="prompt-edit small" value={editing.system} onChange={set('system')} spellCheck={false} placeholder="## 1. …" />
          <div className="prompt-actions">
            <button className="btn accent" onClick={save} disabled={busy}>Save mode</button>
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </section>
      ) : (
        <button className="btn ghost" onClick={() => setEditing({ id: '', name: '', soul: '', system: '' })}>
          <Plus size={13} /> New custom mode
        </button>
      )}
    </>
  )
}

export default function Settings({ modes = [], activeMode = 'study', onActivateMode, onSaveCustomMode, onDeleteCustomMode, onModesChanged }) {
  const t = useTheme()
  const variantOptions = Object.values(t.variants).filter((v) => v.appearance === 'light')
  const darkOptions = Object.values(t.variants).filter((v) => v.appearance === 'dark')
  const [bgWarn, setBgWarn] = useState('')
  const fileRef = useRef(null)
  const [tab, setTab] = useState('general')
  const [prompts, setPrompts] = useState(null) // { soul, system, defaultSoul, defaultSystem, customSoul, customSystem }
  const [soulEdit, setSoulEdit] = useState('')
  const [systemEdit, setSystemEdit] = useState('')
  const [promptBusy, setPromptBusy] = useState(false)
  const [promptStatus, setPromptStatus] = useState('')

  // Soul/System editors always show the ACTIVE mode; reload when the tab
  // or the active mode changes (lazy: no fetch on the General tab).
  useEffect(() => {
    if (tab !== 'soul' && tab !== 'system') return
    let live = true
    window.api?.opencode?.prompts?.()
      .then((p) => {
        if (!live || !p) return
        setPrompts(p)
        setSoulEdit(p.soul || '')
        setSystemEdit(p.system || '')
      })
      .catch(() => {
        if (live) setPromptStatus('Could not load prompts — backend unavailable.')
      })
    return () => {
      live = false
    }
  }, [tab, activeMode])

  const savePrompts = async (soul, system) => {
    if (!window.api?.opencode?.setPrompts) {
      setPromptStatus('Could not save — backend unavailable.')
      return
    }
    setPromptBusy(true)
    setPromptStatus('')
    try {
      const p = await window.api.opencode.setPrompts(soul, system)
      setPrompts(p)
      setSoulEdit(p.soul || '')
      setSystemEdit(p.system || '')
      setPromptStatus('Saved — applies to new turns from now on.')
      onModesChanged?.()
    } catch (e) {
      setPromptStatus(`Could not save: ${e?.message || e}`)
    } finally {
      setPromptBusy(false)
    }
  }
  const saveSoul = () => savePrompts(soulEdit, prompts?.system ?? systemEdit)
  const saveSystem = () => savePrompts(prompts?.soul ?? soulEdit, systemEdit)
  const activeIsBuiltin = modes.find((m) => m.id === activeMode)?.builtin !== false
  const resetSoul = () => {
    if (!prompts) return
    setSoulEdit(prompts.defaultSoul)
    savePrompts(prompts.defaultSoul, prompts.system)
  }
  const resetSystem = () => {
    if (!prompts) return
    setSystemEdit(prompts.defaultSystem)
    savePrompts(prompts.soul, prompts.defaultSystem)
  }

  const pick = async (f) => {
    if (!f) return
    setBgWarn('')
    if (!f.type.startsWith('image/')) {
      setBgWarn('That file is not an image — pick a PNG, JPG or WebP.')
      return
    }
    // Byte-level read first (never needs a decoder); downscale after only
    // to keep it small enough for storage. If decode fails we keep the
    // original bytes instead of erroring out.
    let data
    try {
      data = await readAsDataURL(f)
    } catch {
      setBgWarn('Could not read that image.')
      return
    }
    try {
      data = await downscaleDataUrl(data)
    } catch {
      /* keep original bytes */
    }
    try {
      localStorage.setItem('albert.bgImage', data)
    } catch {
      setBgWarn('Image too large to persist — try a smaller file.')
      return
    }
    t.setBg(data)
  }

  return (
    <div className="settings scroll-fade">
      <h1 className="set-page-title">Settings</h1>
      <div className="set-tabs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[{ value: 'general', label: 'General' }, { value: 'soul', label: 'Soul' }, { value: 'system', label: 'System' }, { value: 'modes', label: 'Modes' }]}
        />
      </div>

      {tab === 'general' && (
      <>
      <section className="set-card">
        <h2>Appearance</h2>
        <Row label="Mode" hint="Follow the OS, or pin one.">
          <Segmented
            value={t.mode}
            onChange={t.setMode}
            options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          />
        </Row>
        <Row label="Light theme" hint="Palette used in light mode.">
          <Dropdown value={t.lightId} onChange={t.setLightId} options={variantOptions.map((v) => ({ value: v.id, label: v.id }))} />
        </Row>
        <Row label="Dark theme" hint="Palette used in dark mode.">
          <Dropdown value={t.darkId} onChange={t.setDarkId} options={darkOptions.map((v) => ({ value: v.id, label: v.id }))} />
        </Row>
        <Row label="Preview" hint="Live tokens of the active palette.">
          <div className="prev-strip">
            <span className="prev-dot" style={{ background: 'var(--bg)' }} title="background" />
            <span className="prev-dot" style={{ background: 'var(--surface)' }} title="shell" />
            <span className="prev-dot" style={{ background: 'var(--surface-raised)' }} title="raised" />
            <span className="prev-dot" style={{ background: 'var(--accent)' }} title="accent" />
            <span className="prev-dot" style={{ background: 'var(--text)' }} title="text" />
          </div>
        </Row>
        <Row label="Accent" hint="Recolors controls, focus and selection only. Syntax and diffs stay theme-owned.">
          <div className="swatches">
            <button
              className={`swatch default ${t.accent === 'themeDefault' ? 'on' : ''}`}
              onClick={() => t.setAccent('themeDefault')}
              title="Theme default"
            >
              <span /><span /><span />
            </button>
            {Object.entries(ACCENTS).map(([k, v]) => (
              <button
                key={k}
                className={`swatch ${t.accent === k ? 'on' : ''}`}
                style={{ '--sw': v[t.appearance] }}
                onClick={() => t.setAccent(k)}
                title={v.label}
              />
            ))}
          </div>
        </Row>
        <Row label="Glass" hint="Frosted blurs the desktop behind the window. Independent of theme and accent.">
          <Segmented
            value={t.surface}
            onChange={t.setSurface}
            options={[{ value: 'themeDefault', label: 'Theme default' }, { value: 'frosted', label: 'Frosted' }, { value: 'opaque', label: 'Opaque' }]}
          />
        </Row>
      </section>

      <section className="set-card">
        <h2>Background</h2>
        <Row label="Image" hint="JPG/PNG from your PC, dimmed under the glass.">
          <div className="bg-pick">
            {t.bg && <img src={t.bg} className="bg-thumb" alt="" />}
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>Choose…</button>
            {t.bg && <button className="btn ghost" onClick={() => t.setBg('')}>Remove</button>}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
              onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }}
            />
          </div>
        </Row>
        {bgWarn && <div className="bg-warn">{bgWarn}</div>}
        <Row label="Visibility" hint="How strongly the image shows through.">
          <div className="bg-pick">
            <input type="range" min={5} max={40} value={t.bgOpacity} onChange={(e) => t.setBgOpacity(Number(e.target.value))} />
            <span className="step-val">{t.bgOpacity}%</span>
          </div>
        </Row>
        <Row label="Fade bottom" hint="Dissolve the image toward the composer.">
          <Switch value={t.bgFade} onChange={t.setBgFade} />
        </Row>
      </section>

      <section className="set-card">
        <h2>Typography</h2>
        <Row label="Chat text" hint="Transcript and bubbles.">
          <Stepper value={t.chatFontSize} min={12} max={20} onChange={t.setChatFontSize} />
        </Row>
        <Row label="Code text" hint="Code blocks and diffs.">
          <Stepper value={t.codeFontSize} min={8} max={32} step={0.5} onChange={t.setCodeFontSize} />
        </Row>
        <Row label="Reduce motion" hint="Snaps entrances and stops loader animation.">
          <Switch value={t.reduceMotion} onChange={t.setReduceMotion} />
        </Row>
      </section>

      <section className="set-card">
        <h2>Composer</h2>
        <Row label="Enter to send" hint="Off: Enter inserts a newline, Ctrl+Enter sends.">
          <Switch value={t.enterToSend} onChange={t.setEnterToSend} />
        </Row>
      </section>

      <section className="set-card">
        <h2>About</h2>
        <Row label="Alfred" hint="Student helper · Electron + React + Vite · Zeron glass theme."><span className="ver">0.1.0</span></Row>
      </section>
      </>
      )}

      {tab === 'soul' && (
        <PromptEditor
          title="Soul"
          hint="Who Alfred is — identity and personality. Edits the active mode."
          value={soulEdit}
          onChange={setSoulEdit}
          onSave={saveSoul}
          onReset={resetSoul}
          showReset={activeIsBuiltin}
          customized={!!prompts?.customSoul}
          status={promptStatus}
          busy={promptBusy || !prompts}
        />
      )}

      {tab === 'system' && (
        <PromptEditor
          title="System"
          hint="How Alfred behaves — tutoring method and rules. Edits the active mode."
          value={systemEdit}
          onChange={setSystemEdit}
          onSave={saveSystem}
          onReset={resetSystem}
          showReset={activeIsBuiltin}
          customized={!!prompts?.customSystem}
          status={promptStatus}
          busy={promptBusy || !prompts}
        />
      )}

      {tab === 'modes' && (
        <ModesTab
          modes={modes}
          activeMode={activeMode}
          onActivateMode={onActivateMode}
          onSaveCustomMode={onSaveCustomMode}
          onDeleteCustomMode={onDeleteCustomMode}
          status={promptStatus}
          setStatus={setPromptStatus}
        />
      )}
    </div>
  )
}
