import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'

/* ─────────────────────────────────────────────────────────
 * APPROVAL CARD (human-in-the-loop) — glass UI.
 * One question at a time with step nav, a rolling step
 * counter, and pill actions: quiet Skip + accent Continue.
 * Multi-select answers accumulate across questions and are
 * submitted once at the end. A per-question custom field
 * appends free text to that question's answers.
 * ───────────────────────────────────────────────────────── */

const ROLL_MS = 400

function optLabel(o) {
  return typeof o === 'string' ? o : o?.label || ''
}

function optDesc(o) {
  return typeof o === 'string' ? '' : o?.description || ''
}

/* odometer step counter — changed characters roll up (or down) */
function RollingDigits({ value }) {
  const prevRef = useRef(value)
  const [oldVal, setOldVal] = useState(value)
  const [view, setView] = useState(value)
  const [rolling, setRolling] = useState(false)
  const [shifted, setShifted] = useState(false)
  const [dir, setDir] = useState('up')

  useEffect(() => {
    if (prevRef.current === value) return
    const from = prevRef.current
    prevRef.current = value
    const fromN = parseInt(from, 10)
    const toN = parseInt(value, 10)
    setDir(Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN ? 'down' : 'up')
    setOldVal(from)
    setView(value)
    setRolling(true)
    setShifted(false)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true))
    })
    const done = setTimeout(() => {
      setRolling(false)
      setOldVal(value)
      setShifted(false)
    }, ROLL_MS)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(done)
    }
  }, [value])

  const chars = rolling ? view : oldVal
  return (
    <>
      {Array.from({ length: chars.length }, (_, i) => {
        const o = oldVal[i] ?? ''
        const n = chars[i] ?? ''
        if (!rolling || o === n) return <span key={`${i}-${n}`}>{n}</span>
        const top = dir === 'down' ? n : o
        const bottom = dir === 'down' ? o : n
        return (
          <span key={`${i}-${o}-${n}-${dir}`} className="appr-roll">
            <span
              className="appr-roll-track"
              style={{ transform: `translateY(${shifted ? (dir === 'down' ? '0' : '-1em') : dir === 'down' ? '-1em' : '0'})` }}
            >
              <span>{top}</span>
              <span>{bottom}</span>
            </span>
          </span>
        )
      })}
    </>
  )
}

export default function ApprovalCard({ tool, requestID, onAnswer }) {
  const qs = Array.isArray(tool?.questions) ? tool.questions : []
  const [qi, setQi] = useState(0)
  const [answers, setAnswers] = useState({}) // qIndex -> array of labels
  const [custom, setCustom] = useState({}) // qIndex -> string
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!qs.length) return null

  const last = qi === qs.length - 1
  const labels = (Array.isArray(qs[qi]?.options) ? qs[qi].options : []).map(optLabel)
  const picked = answers[qi] ?? []
  const hasAnswer = picked.length > 0 || Boolean((custom[qi] || '').trim())

  const goTo = (next) => setQi(Math.min(Math.max(next, 0), qs.length - 1))

  const toggle = (label) => {
    if (sent || busy || !label) return
    setAnswers((prev) => {
      const cur = prev[qi] || []
      return { ...prev, [qi]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] }
    })
  }

  const submit = async () => {
    if (sent || busy || !requestID) return
    setBusy(true)
    setErr('')
    try {
      const out = qs.map((q, i) => {
        const base = [...(answers[i] || [])]
        const c = (custom[i] || '').trim()
        if (c) base.push(c)
        return base
      })
      await onAnswer(out)
      const flat = out.flat()
      setSent(flat.length ? flat.join(', ') : 'answered')
    } catch (e) {
      const msg = e.message || String(e)
      if (/not found|gone|expired|no question|404/i.test(msg)) setSent('request expired')
      else setErr(msg.slice(0, 200))
    } finally {
      setBusy(false)
    }
  }

  const advance = () => {
    if (last) submit()
    else goTo(qi + 1)
  }

  const reset = () => {
    setQi(0)
    setAnswers({})
    setCustom({})
    setSent(null)
    setErr('')
  }

  if (tool.done && !sent) {
    return (
      <div className="q-card">
        <div className="q-answered">Answered ✓</div>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="appr-sent">
        <span className="appr-sent-pill">
          <span className="appr-sent-check"><Check size={11} strokeWidth={3} /></span>
          Answers sent
        </span>
        <span className="appr-sent-what" title={sent}>{sent}</span>
        <button type="button" onClick={reset} className="appr-start-over">Start over</button>
      </div>
    )
  }

  const q = qs[qi] || {}
  const opts = Array.isArray(q.options) ? q.options : []

  return (
    <div className="q-card appr">
      <button type="button" aria-label="Dismiss" onClick={() => goTo(qs.length - 1)} className="icon-btn appr-x" title="Skip to last">
        <X size={14} />
      </button>
      {q.header && <div className="q-header">{q.header}</div>}
      <div className="appr-q" key={qi}>{q.question || `Question ${qi + 1}`}</div>
      <div className="q-opts" role="group" aria-label={q.question || `Question ${qi + 1}`}>
        {opts.map((o) => {
          const label = optLabel(o)
          const desc = optDesc(o)
          const on = picked.includes(label)
          return (
            <button
              key={label || desc}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => toggle(label)}
              className={`q-opt appr-opt${on ? ' on' : ''}`}
              title={desc}
            >
              <span className={`appr-box${on ? ' on' : ''}`}>
                <Check size={12} strokeWidth={3} />
              </span>
              <span className="appr-text">
                <span className="q-opt-label">{label}</span>
                {desc && <span className="q-opt-desc">{desc}</span>}
              </span>
            </button>
          )
        })}
        <label className="q-opt appr-custom">
          <input
            value={custom[qi] ?? ''}
            onChange={(e) => setCustom((prev) => ({ ...prev, [qi]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasAnswer && !busy) {
                e.preventDefault()
                advance()
              }
            }}
            placeholder="Something else…"
            aria-label="Custom answer"
            className="appr-input"
          />
        </label>
      </div>

      {!requestID && <div className="q-answered">Waiting for request…</div>}
      {err && <div className="q-err">{err}</div>}

      <div className="appr-footer">
        <span className="appr-steps">
          <button type="button" aria-label="Previous question" disabled={qi <= 0} onClick={() => goTo(qi - 1)} className="appr-step-btn">
            <ChevronUp size={14} />
          </button>
          <span className="appr-count"><RollingDigits value={`${qi + 1} / ${qs.length}`} /></span>
          <button type="button" aria-label="Next question" disabled={last} onClick={() => goTo(qi + 1)} className="appr-step-btn">
            <ChevronDown size={14} />
          </button>
        </span>
        <span className="appr-actions">
          <button type="button" className="btn ghost appr-skip" onClick={() => (last ? setQi(qi) : goTo(qi + 1))}>
            Skip
          </button>
          <button type="button" className="btn accent appr-go" disabled={!hasAnswer || busy || !requestID} onClick={advance}>
            {busy ? 'Sending…' : last ? 'Send' : 'Continue'}
          </button>
        </span>
      </div>
    </div>
  )
}
