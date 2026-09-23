import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { THEMES, resolveTheme } from './tokens'

const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

function systemAppearance() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('albert.appearance') || 'system')
  const [lightId, setLightId] = useState(() => localStorage.getItem('albert.light') || 'zeron-light')
  const [darkId, setDarkId] = useState(() => {
    const s = localStorage.getItem('albert.dark')
    return !s || s === 'zeron-dark' ? 'studio-dark' : s
  })
  const [accent, setAccent] = useState(() => localStorage.getItem('albert.accent') || 'themeDefault')
  const [surface, setSurface] = useState(() => localStorage.getItem('albert.surface') || 'themeDefault')
  const [chatFontSize, setChatFontSize] = useState(() => Number(localStorage.getItem('albert.chatFont') || 14))
  const [codeFontSize, setCodeFontSize] = useState(() => Number(localStorage.getItem('albert.codeFont') || 12.5))
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('albert.reduceMotion') === '1')
  const [enterToSend, setEnterToSend] = useState(() => localStorage.getItem('albert.enterToSend') !== '0')
  const [bg, setBg] = useState(() => localStorage.getItem('albert.bgImage') || '')
  const [bgOpacity, setBgOpacity] = useState(() => Number(localStorage.getItem('albert.bgOpacity') ?? 20))
  const [bgFade, setBgFade] = useState(() => localStorage.getItem('albert.bgFade') !== '0')
  const [loaderVariant, setLoaderVariant] = useState(() => localStorage.getItem('albert.loaderVariant') || 'Drive')
  const [sys, setSys] = useState(systemAppearance())

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const fn = (e) => setSys(e.matches ? 'light' : 'dark')
    mq.addEventListener?.('change', fn)
    return () => mq.removeEventListener?.('change', fn)
  }, [])

  const appearance = mode === 'system' ? sys : mode
  const theme = useMemo(
    () => resolveTheme(appearance === 'light' ? lightId : darkId, { accent, surface }),
    [appearance, lightId, darkId, accent, surface]
  )

  useEffect(() => {
    const r = document.documentElement.style
    const t = theme
    r.setProperty('--bg', t.background)
    r.setProperty('--surface', t.shell)
    r.setProperty('--surface-raised', t.raised)
    r.setProperty('--surface-card', t.card)
    r.setProperty('--surface-dialog', t.dialog)
    r.setProperty('--surface-overlay', t.overlay)
    r.setProperty('--hover', t.hover)
    r.setProperty('--active', t.active)
    r.setProperty('--border', t.border)
    r.setProperty('--border-strong', t.borderStrong)
    r.setProperty('--text', t.text)
    r.setProperty('--text-muted', t.textMuted)
    r.setProperty('--text-faint', t.textFaint)
    r.setProperty('--text-dim', t.textDim)
    r.setProperty('--solid', t.solid)
    r.setProperty('--on-solid', t.onSolid)
    r.setProperty('--accent', t.accent)
    r.setProperty('--danger', t.danger)
    r.setProperty('--warning', t.warning)
    r.setProperty('--success', t.success)
    r.setProperty('--input-bg', t.inputBg)
    r.setProperty('--selection', t.selection)
    r.setProperty('--diff-add', t.diffAdd)
    r.setProperty('--diff-del', t.diffDel)
    r.setProperty('--diff-hunk', t.diffHunk)
    r.setProperty('--chat-font-size', `${chatFontSize}px`)
    r.setProperty('--code-font-size', `${codeFontSize}px`)
    for (const [k, v] of Object.entries(t.syntax || {})) r.setProperty(`--syn-${k}`, v)
    if (bg) r.setProperty('--bg-image', `url(${JSON.stringify(bg)})`)
    else r.removeProperty('--bg-image')
    r.setProperty('--bg-opacity', String(Math.min(40, Math.max(5, bgOpacity)) / 100))
    document.body.classList.toggle('has-bg', !!bg)
    document.body.classList.toggle('fade-bg', !!bg && bgFade)
    document.body.classList.toggle('glass', t.isGlass)
    document.body.classList.toggle('reduce-motion', reduceMotion)
    document.body.dataset.appearance = t.appearance
    localStorage.setItem('albert.appearance', mode)
    localStorage.setItem('albert.light', lightId)
    localStorage.setItem('albert.dark', darkId)
    localStorage.setItem('albert.accent', accent)
    localStorage.setItem('albert.surface', surface)
    localStorage.setItem('albert.chatFont', String(chatFontSize))
    localStorage.setItem('albert.codeFont', String(codeFontSize))
    localStorage.setItem('albert.reduceMotion', reduceMotion ? '1' : '0')
    localStorage.setItem('albert.enterToSend', enterToSend ? '1' : '0')
    localStorage.setItem('albert.bgImage', bg)
    localStorage.setItem('albert.bgOpacity', String(bgOpacity))
    localStorage.setItem('albert.bgFade', bgFade ? '1' : '0')
    localStorage.setItem('albert.loaderVariant', loaderVariant)
  }, [theme, mode, lightId, darkId, accent, surface, chatFontSize, codeFontSize, reduceMotion, enterToSend, bg, bgOpacity, bgFade, loaderVariant])

  const value = { theme, appearance, mode, setMode, lightId, setLightId, darkId, setDarkId, accent, setAccent, surface, setSurface, chatFontSize, setChatFontSize, codeFontSize, setCodeFontSize, reduceMotion, setReduceMotion, enterToSend, setEnterToSend, bg, setBg, bgOpacity, setBgOpacity, bgFade, setBgFade, loaderVariant, setLoaderVariant, variants: THEMES }
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}
