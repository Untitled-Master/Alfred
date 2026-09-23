import { memo } from 'react'
import { CornerDownLeft } from 'lucide-react'

/* ─────────────────────────────────────────────────────────
 * STREAMING TEXT — live assistant words resolve out of blur
 * as SSE tokens arrive (existing words keep their DOM nodes,
 * so only new words animate). Caret rides at the end while
 * live; optional follow-up prompts appear when done.
 * ───────────────────────────────────────────────────────── */

function StreamingText({ text = '', done = false, followUps = [], onFollowUp }) {
  const words = String(text).split(/(\s+)/)
  return (
    <div className="stream-wrap">
      <p className="stream-text words">
        {words.map((w, i) =>
          /^\s+$/.test(w) || w === '' ? (
            <span key={i}>{w}</span>
          ) : (
            <span key={i} className="stream-word">{w}</span>
          )
        )}
      </p>
      {done && followUps.length > 0 && (
        <div className="stream-follow">
          <p className="stream-follow-head">Follow-ups</p>
          {followUps.map((text, i) => (
            <button
              key={text}
              type="button"
              onClick={() => onFollowUp?.(text, i)}
              className="stream-follow-btn"
              style={{ animation: `fade-up 350ms cubic-bezier(0.23,1,0.32,1) ${i * 90}ms both` }}
            >
              <CornerDownLeft size={11} />
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default memo(StreamingText)
