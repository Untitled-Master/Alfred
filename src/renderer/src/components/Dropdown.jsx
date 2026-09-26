import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export default function Dropdown({ value, options, onChange, align = 'right', direction = 'down', searchPlaceholder = '', className = '' }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const cur = options.find((o) => o.value === value)
  const filtering = !!(searchPlaceholder && f.trim())
  const shown = filtering
    ? options.filter(
        (o) => !o.header && `${o.label} ${o.hint || ''} ${o.value}`.toLowerCase().includes(f.trim().toLowerCase())
      )
    : options

  return (
    <div className={`dd${className ? ` ${className}` : ''}`} ref={ref}>
      <button type="button" className={`dd-btn${open ? ' open' : ''}`} onClick={() => { setF(''); setOpen((o) => !o) }}>
        <span className="dd-label">{cur?.label ?? value}</span>
        <ChevronDown size={13} className={`dd-chev${open ? ' up' : ''}`} />
      </button>
      {open && (
        <div className={`dd-pop popover ${align}${direction === 'up' ? ' up' : ''}`}>
          {searchPlaceholder && (
            <div className="dd-search">
              <input autoFocus placeholder={searchPlaceholder} value={f} onChange={(e) => setF(e.target.value)} />
            </div>
          )}
          {shown.map((o) =>
            o.header ? (
              <div key={`h-${o.header}`} className="dd-head">{o.header}</div>
            ) : (
              <div
                key={o.value}
                className={`dd-item${o.value === value ? ' on' : ''}${o.hint ? ' stacked' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false) }}
              >
                <span className="dd-main">
                  <span className="dd-title">{o.label}</span>
                  {o.hint && <span className="dd-sub" title={o.hint}>{o.hint}</span>}
                </span>
                {o.value === value && <Check size={13} className="dd-check" />}
              </div>
            )
          )}
          {filtering && !shown.length && <div className="dd-empty">No matches.</div>}
        </div>
      )}
    </div>
  )
}
