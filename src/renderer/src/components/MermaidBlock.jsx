import { Children, isValidElement, useEffect, useState } from 'react'
import { useTheme } from '../theme/ThemeContext'

const cssVar = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb

export const textOf = (nodes) =>
  Children.toArray(nodes)
    .map((n) => (typeof n === 'string' || typeof n === 'number' ? String(n) : isValidElement(n) ? textOf(n.props?.children) : ''))
    .join('')

export function mermaidTheme(dark) {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'base',
    themeVariables: {
      primaryColor: cssVar('--accent', '#8b7cf6'),
      primaryTextColor: cssVar('--text', '#e8e8ea'),
      primaryBorderColor: cssVar('--accent', '#8b7cf6'),
      lineColor: cssVar('--text-muted', '#a1a1a6'),
      secondaryColor: cssVar('--surface-raised', '#2e2e30'),
      tertiaryColor: cssVar('--surface', '#1a1a1a'),
      background: cssVar('--bg', '#212121'),
      mainBkg: cssVar('--surface-raised', '#2e2e30'),
      nodeBorder: cssVar('--accent', '#8b7cf6'),
      clusterBkg: cssVar('--surface-card', '#262628'),
      titleColor: cssVar('--text', '#e8e8ea')
    }
  }
}

export async function renderMermaid(code, dark) {
  const mod = await import('mermaid')
  const mermaid = mod.default ?? mod
  mermaid.initialize(mermaidTheme(dark))
  const id = 'mm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const { svg } = await mermaid.render(id, code)
  return svg
}

// Inline ```mermaid fence renderer for the transcript. While the fence is
// still streaming (or on invalid syntax) it falls back to the raw block,
// so partial turns degrade to code instead of erroring.
export default function MermaidBlock({ children }) {
  const code = textOf(children).trim()
  const { appearance } = useTheme()
  const dark = appearance !== 'light'
  const [svg, setSvg] = useState('')
  const [bad, setBad] = useState(false)

  useEffect(() => {
    let live = true
    setSvg('')
    setBad(false)
    if (!code) return undefined
    ;(async () => {
      try {
        const out = await renderMermaid(code, dark)
        if (live) setSvg(out)
      } catch {
        if (live) setBad(true)
      }
    })()
    return () => {
      live = false
    }
  }, [code, dark])

  if (bad || !svg) {
    if (!code) return null
    return (
      <div className="codeblock">
        <div className="codeblock-bar"><span>mermaid</span></div>
        <pre><code>{code}</code></pre>
      </div>
    )
  }
  return <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
}
