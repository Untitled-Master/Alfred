import { useEffect, useState } from 'react'

/* ─────────────────────────────────────────────────────────
 * LOADING STATE — pixel-grid loader for long-running work
 *
 * Variants:
 *   Drive  — square cells, chevron wavefront driving right;
 *            the 650ms cycle is shorter than the sweep, so
 *            two fronts are always in flight
 *   Dots   — same wavefront, circular cells
 *   Orbit  — a comet lapping the grid perimeter
 *   Surfer — the Drive loader paired with a meme video below
 *
 * Paired with a shimmering label and a live elapsed timer
 * in mono tabular figures. Reduced motion freezes the grid
 * to its dim state; the timer still ticks.
 * ───────────────────────────────────────────────────────── */

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3), c = i % 3
  return (c + Math.abs(r - 1)) * 90
})

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3]
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i)
  return k === -1 ? null : k * 110
})

const PATTERNS = {
  Drive: { delays: chevron, dur: 650, round: false },
  Dots: { delays: chevron, dur: 650, round: true },
  Orbit: { delays: orbit, dur: 950, round: false },
}

export const LOADER_VARIANTS = ['Drive', 'Dots', 'Orbit', 'Surfer']

function LoaderGrid({ delays, dur, round }) {
  return (
    <span aria-hidden className="loader-grid">
      {delays.map((delay, index) => (
        <span
          key={index}
          className={`loader-pixel${round ? ' round' : ''}`}
          style={{
            opacity: delay === null ? 0.07 : 0.15,
            animation: delay === null ? 'none' : `pixel-on ${dur}ms ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  )
}

function useElapsed() {
  const [ds, setDs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setDs((d) => d + 1), 100)
    return () => clearInterval(t)
  }, [])
  const total = ds / 10
  if (total < 60) return `${total.toFixed(1)}s`
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`
}

export default function LoadingState({
  label,
  variant = 'Drive',
  /** the meme feed for the Surfer variant; hosted on Vercel Blob so it plays in
   *  production (the local /public/subway-surfers.mp4 stays gitignored).
   *  Heavily compressed (288px, 20fps, no audio → ~265 KB, from 1.1 MB) to keep
   *  Blob data transfer down. */
  videoSrc = 'https://95dnc2a95qgwt9ff.public.blob.vercel-storage.com/subway-surfers-min.mp4',
}) {
  const elapsed = useElapsed()
  const surfer = variant === 'Surfer'
  const resolvedLabel = label ?? (surfer ? 'Subway surfing' : 'Churning')
  const [videoOk, setVideoOk] = useState(true)
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive

  const labelEl = <span className="loading-label">{resolvedLabel}</span>
  const elapsedEl = <span className="loading-elapsed">{elapsed}</span>

  if (surfer) {
    return (
      <div role="status" className="loading-state column">
        <div className="loading-row">
          <LoaderGrid {...PATTERNS.Drive} />
          {labelEl}
          {elapsedEl}
        </div>

        {/* the context card follows the status text it is illustrating */}
        <div className="loading-surfer-card">
          <div className="loading-surfer-media">
            {videoOk ? (
              <video
                src={videoSrc}
                autoPlay
                muted
                loop
                playsInline
                onError={() => setVideoOk(false)}
                className="loading-surfer-video"
              />
            ) : (
              <div className="loading-surfer-fallback">
                <LoaderGrid {...PATTERNS.Drive} />
                <span className="loading-surfer-err">Video unavailable</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div role="status" className="loading-state">
      <LoaderGrid delays={delays} dur={dur} round={round} />
      {labelEl}
      {elapsedEl}
    </div>
  )
}
