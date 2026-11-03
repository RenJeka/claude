// Formatting helpers shared by the collector and the views.

export const fmtTok = (n: number | undefined): string => {
  if (n === undefined || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

export const fmtMs = (ms: number | undefined): string => {
  if (ms === undefined || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} мс`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} с`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} хв ${s % 60} с`
  const h = Math.floor(m / 60)
  return `${h} год ${m % 60} хв`
}

export const fmtAgo = (at: number, now: number): string => {
  const d = Math.max(0, now - at)
  if (d < 10_000) return 'щойно'
  return `${fmtMs(d)} тому`
}

export const fmtUsd = (usd: number | undefined): string =>
  usd === undefined ? '—' : usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`

export const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0

/** A text bar of `width` cells, filled to `percent`. */
export const bar = (percent: number, width: number): string => {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const clip = (text: string, max: number): string => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export const SOURCE_LABEL: Record<string, string> = {
  userSettings: 'користувач',
  projectSettings: 'проєкт',
  localSettings: 'локальні',
  policySettings: 'політика',
  plugin: 'плагін',
  'built-in': 'вбудований',
  builtin: 'вбудований',
  mcp: 'MCP',
  syncedSkills: 'акаунт',
  user: 'користувач',
}

export const sourceLabel = (s: string): string => SOURCE_LABEL[s] ?? s

export const KIND_LABEL: Record<string, string> = {
  session: 'Сесія',
  prompt: 'Промпт',
  turn: 'Хід',
  tool: 'Інструмент',
  skill: 'Скіл',
  mcp: 'MCP',
  agent: 'Агент',
  compact: 'Стиснення',
  search: 'Пошук інстр.',
}

export const KIND_COLOR: Record<string, string> = {
  session: '#98a2b3',
  prompt: '#6a9bcc',
  turn: '#7fb069',
  tool: '#d97757',
  skill: '#c792ea',
  mcp: '#56b6c2',
  agent: '#e5c07b',
  compact: '#e06c75',
  search: '#a3a3a3',
}

/** The theme key a kind's text is drawn in. */
export const KIND_THEME: Record<string, string> = {
  session: 'subtle',
  prompt: 'suggestion',
  turn: 'success',
  tool: 'claude',
  skill: 'merged',
  mcp: 'ide',
  agent: 'warning',
  compact: 'error',
  search: 'inactive',
}

export const PALETTE = [
  '#d97757',
  '#6a9bcc',
  '#7fb069',
  '#c792ea',
  '#e5c07b',
  '#56b6c2',
  '#e06c75',
  '#b48ead',
  '#88c0d0',
  '#a3be8c',
]

export const xml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A Box key from any name: letters, digits, `-` and `_` only. */
export const keyOf = (prefix: string, name: string, i: number): string =>
  `${prefix}-${i}-${name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40)}`

/** `mcp__server__tool` → `server`; undefined for a non-MCP name. */
export const mcpServerOf = (tool: string): string | undefined => {
  if (!tool.startsWith('mcp__')) return undefined
  const rest = tool.slice(5)
  const cut = rest.indexOf('__')
  return cut === -1 ? rest : rest.slice(0, cut)
}

export const mcpToolOf = (tool: string): string => {
  const rest = tool.slice(5)
  const cut = rest.indexOf('__')
  return cut === -1 ? rest : rest.slice(cut + 2)
}
