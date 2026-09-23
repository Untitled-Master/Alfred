import { useCallback, useEffect, useState } from 'react'

// Shared update-feed state (GitHub Releases via the main process).
// Main pushes full snapshots on `upd:event`; check()/install() resolve
// with the latest snapshot too.
const initial = {
  supported: false,
  current: '',
  status: 'idle', // idle|checking|available|downloading|downloaded|uptodate|error
  latest: null,
  notes: '',
  progress: 0,
  error: '',
  releasesUrl: ''
}

export function useUpdater() {
  const [s, setS] = useState(initial)
  useEffect(() => {
    let live = true
    window.api?.updates?.state().then((st) => {
      if (live && st) setS(st)
    }).catch(() => {})
    const off = window.api?.updates?.onEvent?.((p) => {
      if (p?.type === 'upd' && p.snapshot) setS(p.snapshot)
    })
    return () => {
      live = false
      off?.()
    }
  }, [])
  const check = useCallback(() => {
    window.api?.updates?.check().then((st) => {
      if (st) setS(st)
    }).catch(() => {})
  }, [])
  const install = useCallback(() => {
    window.api?.updates?.install().catch(() => {})
  }, [])
  return { ...s, check, install }
}
