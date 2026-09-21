import { useCallback, useEffect, useRef, useState } from 'react'

export const DEFAULT_MODEL = { providerID: 'opencode', modelID: 'muse-spark-1.3-contributor-free' }
// Measured Sep 2026 ("reply ok" turn): ~350ms to first token vs ~1000ms for
// big-pickle. Free-tier speeds drift, so this is a hint, not a ranking.
export const FAST_MODELS = new Set([
  'opencode/muse-spark-1.3-contributor-free',
  'opencode/mimo-v2.5-free',
  'openrouter/cohere/north-mini-code:free'
])
export const modelKey = (m) => `${m.providerID}/${m.modelID}`

// OpenCode backend state: server status, free-model catalog, selected model,
// and one global SSE subscription (routed by the caller via onPayload).
export function useOpencode(onPayload) {
  const [status, setStatus] = useState({ running: false })
  const [models, setModels] = useState([])
  const [paid, setPaid] = useState([])
  const [commands, setCommands] = useState([])
  const [model, setModelState] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('albert.model'))
      if (s?.providerID && s?.modelID) {
        // One-time migration off the old slow default (never user-chosen).
        if (`${s.providerID}/${s.modelID}` === 'opencode/big-pickle') return { ...DEFAULT_MODEL }
        return s
      }
    } catch { /* fall through */ }
    return DEFAULT_MODEL
  })
  const cb = useRef(onPayload)
  cb.current = onPayload

  const refresh = useCallback(async () => {
    let s
    try {
      s = await window.api.opencode.status()
    } catch {
      s = { running: false }
    }
    setStatus(s)
    if (!s.running) {
      setModels([])
      setPaid([])
      setCommands([])
      return
    }
    try {
      const [m, cmds] = await Promise.all([
        window.api.opencode.models(),
        window.api.opencode.commands().catch(() => [])
      ])
      const free = m.free || []
      setModels(free)
      setPaid(m.paid || [])
      setCommands(Array.isArray(cmds) ? cmds : [])
      setModelState((cur) => {
        if ([...free, ...(m.paid || [])].some((f) => modelKey(f) === modelKey(cur))) return cur
        const d = free.find((f) => modelKey(f) === modelKey(DEFAULT_MODEL)) || free[0]
        if (d) {
          const next = { providerID: d.providerID, modelID: d.modelID }
          localStorage.setItem('albert.model', JSON.stringify(next))
          return next
        }
        return cur
      })
    } catch {
      setModels([])
      setPaid([])
      setCommands([])
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => window.api.opencode.onEvent((p) => cb.current?.(p)), [])

  const setModel = (m) => {
    setModelState(m)
    localStorage.setItem('albert.model', JSON.stringify(m))
  }

  return { status, models, paid, commands, model, setModel, refresh }
}
