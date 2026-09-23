// Zeron glass theme seeds — from ZERON_THEME_GLASS_SPEC.md (§2-7).
// Numbers drive layout, colors are paint. Start with Zeron pair only.

export const ACCENTS = {
  zeron: { dark: '#8b7cf6', light: '#5b43e8', label: 'Zeron' },
  orange: { dark: '#fb923c', light: '#c2410c', label: 'Orange' },
  amber: { dark: '#fbbf24', light: '#a16207', label: 'Amber' },
  green: { dark: '#4ade80', light: '#15803d', label: 'Green' },
  cyan: { dark: '#22d3ee', light: '#0e7490', label: 'Cyan' },
  blue: { dark: '#60a5fa', light: '#2563eb', label: 'Blue' },
  pink: { dark: '#f472b6', light: '#be185d', label: 'Pink' }
}

export const THEMES = {
  'zeron-dark': {
    id: 'zeron-dark',
    appearance: 'dark',
    treatment: 'frosted',
    background: '#060606',
    shell: '#0d0d0d',
    raised: '#343438',
    card: '#0e0e0e',
    dialog: '#101010',
    overlay: '#161616',
    hover: 'rgba(235,235,235,0.11)',
    active: 'rgba(139,124,246,0.18)',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
    text: '#E9E9EC',
    textMuted: '#B3B3B8',
    textFaint: '#8E8E93',
    textDim: '#989898',
    solid: '#EDEDEF',
    onSolid: '#0E0E0E',
    danger: '#FF6467',
    dangerMuted: '#FF9A9B',
    warning: '#FFB900',
    warningMuted: '#FFE08A',
    success: '#3DD68C',
    successMuted: '#8FDCB5',
    inputBg: 'rgba(255,255,255,0.03)',
    selection: 'rgba(139,124,246,0.35)',
    cursor: 'rgba(255,255,255,0.35)',
    diffAdd: '#3DD68C',
    diffDel: '#FF6467',
    diffHunk: 'rgba(139,124,246,0.08)',
    terminalBg: '#090909',
    terminalFg: '#E9E9EC',
    syntax: {
      comment: '#92929a',
      keyword: '#8b7cf6',
      string: '#34d399',
      number: '#facc15',
      type: '#c084fc',
      function: '#60a5fa',
      property: '#f472b6',
      variable: '#e8e8ea',
      punctuation: '#a1a1aa',
      tag: '#f472b6',
      attribute: '#22d3ee',
      invalid: '#f87171'
    },
    ansi: [
      '#242424', '#f87171', '#4ade80', '#facc15',
      '#60a5fa', '#c084fc', '#22d3ee', '#d4d4d8',
      '#52525b', '#fca5a5', '#86efac', '#fde047',
      '#93c5fd', '#d8b4fe', '#67e8f9', '#fafafa'
    ]
  },
  'zeron-light': {
    id: 'zeron-light',
    appearance: 'light',
    treatment: 'frosted',
    background: '#ffffff',
    shell: '#F5F5F7',
    raised: '#F0F0F2',
    card: '#ffffff',
    dialog: '#ffffff',
    overlay: '#ffffff',
    hover: 'rgba(0,0,0,0.06)',
    active: 'rgba(91,67,232,0.10)',
    border: 'rgba(0,0,0,0.10)',
    borderStrong: 'rgba(0,0,0,0.17)',
    text: '#404046',
    textMuted: '#6F6F77',
    textFaint: '#88888F',
    textDim: '#808084',
    solid: '#34343A',
    onSolid: '#FBFBFC',
    danger: '#DC2626',
    dangerMuted: '#991B1B',
    warning: '#A16207',
    warningMuted: '#854D0E',
    success: '#15803D',
    successMuted: '#166534',
    inputBg: '#ffffff',
    selection: 'rgba(91,67,232,0.24)',
    cursor: 'rgba(0,0,0,0.55)',
    diffAdd: '#15803D',
    diffDel: '#DC2626',
    diffHunk: 'rgba(91,67,232,0.07)',
    terminalBg: '#fafafa',
    terminalFg: '#404046',
    syntax: {
      comment: '#6b7280',
      keyword: '#5b43e8',
      string: '#15803d',
      number: '#a16207',
      type: '#7e22ce',
      function: '#2563eb',
      property: '#be185d',
      variable: '#303035',
      punctuation: '#52525b',
      tag: '#be185d',
      attribute: '#0e7490',
      invalid: '#b91c1c'
    },
    ansi: [
      '#1f1f1f', '#dc2626', '#16a34a', '#b45309',
      '#2563eb', '#9333ea', '#0e7490', '#3f3f46',
      '#71717a', '#b91c1c', '#15803d', '#92400e',
      '#1d4ed8', '#7e22ce', '#155e75', '#18181b'
    ]
  },
  'studio-dark': {
    id: 'studio-dark',
    appearance: 'dark',
    treatment: 'frosted',
    background: '#212121',
    shell: '#1a1a1a',
    raised: '#2e2e30',
    card: '#262628',
    dialog: '#262628',
    overlay: '#2c2c2e',
    hover: 'rgba(255,255,255,0.07)',
    active: 'rgba(139,124,246,0.16)',
    border: 'rgba(255,255,255,0.09)',
    borderStrong: 'rgba(255,255,255,0.16)',
    text: '#E8E8EA',
    textMuted: '#A1A1A6',
    textFaint: '#6E6E73',
    textDim: '#8a8a8f',
    solid: '#EDEDEF',
    onSolid: '#101012',
    danger: '#F87171',
    dangerMuted: '#E08A8A',
    warning: '#FACC15',
    warningMuted: '#D9C26A',
    success: '#34D399',
    successMuted: '#7FD6A8',
    inputBg: '#2a2a2c',
    selection: 'rgba(139,124,246,0.32)',
    cursor: 'rgba(255,255,255,0.4)',
    diffAdd: '#34D399',
    diffDel: '#F87171',
    diffHunk: 'rgba(139,124,246,0.10)',
    terminalBg: '#1a1a1a',
    terminalFg: '#E8E8EA',
    syntax: {
      comment: '#7a7a80',
      keyword: '#8b7cf6',
      string: '#34d399',
      number: '#facc15',
      type: '#c084fc',
      function: '#60a5fa',
      property: '#f472b6',
      variable: '#e8e8ea',
      punctuation: '#a1a1aa',
      tag: '#f472b6',
      attribute: '#22d3ee',
      invalid: '#f87171'
    },
    ansi: [
      '#242424', '#f87171', '#4ade80', '#facc15',
      '#60a5fa', '#c084fc', '#22d3ee', '#d4d4d8',
      '#52525b', '#fca5a5', '#86efac', '#fde047',
      '#93c5fd', '#d8b4fe', '#67e8f9', '#fafafa'
    ]
  }
}

export function resolveTheme(variantId, { accent = 'themeDefault', surface = 'themeDefault' } = {}) {
  const base = THEMES[variantId] || THEMES['zeron-dark']
  const effective = surface === 'themeDefault' ? base.treatment : surface
  const preset =
    accent === 'themeDefault' ? null : ACCENTS[accent] || null
  const accentColor = preset
    ? preset[base.appearance]
    : base.appearance === 'dark'
      ? ACCENTS.zeron.dark
      : ACCENTS.zeron.light
  return { ...base, accent: accentColor, surfaceTreatment: effective, isGlass: effective === 'frosted' }
}
