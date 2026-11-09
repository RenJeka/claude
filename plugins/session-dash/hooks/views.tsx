import type { Elements, RenderElement } from 'claude-code'

import type { DashEvent, DashSnap, DashStats } from '../types'
import {
  KIND_COLOR,
  KIND_LABEL,
  KIND_THEME,
  PALETTE,
  clip,
  fmtAgo,
  fmtMs,
  fmtTok,
  fmtUsd,
  keyOf,
  mcpServerOf,
  mcpToolOf,
  pct,
  sourceLabel,
  xml,
} from './format'

export type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & {
  Svg?: Elements['desktop']['Svg']
}

export type Data = {
  snap: DashSnap | null
  stats: DashStats
  events: DashEvent[]
  now: number
  cols: number
  skillSource: string
}

export type Acts = {
  setTab: (tab: string) => void
  setSkillSource: (source: string) => void
  refresh: () => void
}

export const TABS: { id: string; label: string; hotkey: string }[] = [
  { id: 'overview', label: 'Огляд', hotkey: '1' },
  { id: 'skills', label: 'Скіли', hotkey: '2' },
  { id: 'mcp', label: 'MCP', hotkey: '3' },
  { id: 'agents', label: 'Агенти', hotkey: '4' },
  { id: 'plugins', label: 'Плагіни', hotkey: '5' },
  { id: 'context', label: 'Контекст', hotkey: '6' },
  { id: 'timeline', label: 'Таймлайн', hotkey: '7' },
]

const ctxColor = (p: number | undefined) =>
  p === undefined ? 'inactive' : p >= 85 ? 'error' : p >= 60 ? 'warning' : 'success'

const statusIcon = (s: string) =>
  s === 'completed' ? '✓' : s === 'failed' || s === 'killed' ? '✗' : s === 'running' ? '▶' : '…'

const statusColor = (s: string) =>
  s === 'completed' ? 'success' : s === 'failed' || s === 'killed' ? 'error' : s === 'running' ? 'claude' : 'inactive'

// ── Shared pieces ───────────────────────────────────────────────────────────
// Nothing here changes on hover: every row keeps its size, so nothing moves.

const Section = (ui: UI, title: string, hint: string | undefined, body: RenderElement | RenderElement[]) => {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" gap={1}>
        <Text weight="semibold">{title}</Text>
        {hint !== undefined && (
          <Text dimColor size="footnote">
            {hint}
          </Text>
        )}
      </Box>
      {body}
    </Box>
  )
}

/** A thin bar: the filled part in `color`, the rest dim. */
const Meter = (ui: UI, percent: number, width: number, color = 'claude') => {
  const { Text } = ui
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return (
    <Text mono>
      <Text color={color}>{'━'.repeat(filled)}</Text>
      <Text dimColor>{'─'.repeat(width - filled)}</Text>
    </Text>
  )
}

/** A figure with a small label above and a small note under it. */
const Stat = (ui: UI, key: string, label: string, value: string, note: string, color = 'text') => {
  const { Box, Text } = ui
  return (
    <Box key={key} flexDirection="column" minWidth={15} paddingRight={2}>
      <Text dimColor size="caption">
        {label}
      </Text>
      <Text weight="semibold" color={color} tabular>
        {value}
      </Text>
      <Text dimColor size="footnote" wrap="truncate-end">
        {note}
      </Text>
    </Box>
  )
}

const Dim = (ui: UI, text: string) => {
  const { Text } = ui
  return (
    <Text dimColor size="footnote">
      {text}
    </Text>
  )
}

// ── Header and tab bar ──────────────────────────────────────────────────────

export const Header = (ui: UI, d: Data, tab: string, isRefreshing: boolean, acts: Acts) => {
  const { Box, Text, Button } = ui
  const s = d.snap
  const up = s ? d.now - s.startedAt : undefined
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Text weight="semibold">{s?.model ?? '—'}</Text>
        <Text dimColor size="footnote">
          {fmtMs(up)} · {fmtUsd(s?.costUsd)} ·{' '}
        </Text>
        <Text color={ctxColor(s?.ctx.percent)} size="footnote">
          контекст {s?.ctx.percent ?? '—'}%
        </Text>
        <Text dimColor size="footnote">
          · оновлено {s ? fmtAgo(s.at, d.now) : 'ще ні'}
        </Text>
      </Box>
      <Box flexDirection="row" gap={1} flexWrap="wrap" marginTop={1}>
        {TABS.map(t => (
          <Button
            key={`tab-${t.id}`}
            label={t.label}
            hotkey={t.hotkey}
            variant={t.id === tab ? 'primary' : 'secondary'}
            onPress={() => acts.setTab(t.id)}
          />
        ))}
        <Button key="refresh" label={isRefreshing ? '…' : '↻'} hotkey="r" onPress={() => acts.refresh()} />
      </Box>
    </Box>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────

export const Overview = (ui: UI, d: Data) => {
  const { Box, Text } = ui
  const s = d.snap
  const st = d.stats
  const calls = Object.values(st.tools).reduce((n, t) => n + t.n, 0)
  const errors = Object.values(st.tools).reduce((n, t) => n + t.errors, 0)
  const usedSkills = Object.keys(st.skills).length
  const servers = new Set([
    ...(s?.mcpTools ?? []).map(t => t.server),
    ...(s?.tools ?? []).filter(t => t.mcp).map(t => mcpServerOf(t.name) ?? t.name),
  ])
  const top = Object.entries(st.tools)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8)
  const topMax = top[0]?.[1].n ?? 1
  const barW = Math.max(6, Math.min(20, d.cols - 50))

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" marginTop={1}>
        {Stat(ui, 'kpi-prompts', 'Промпти', String(st.prompts), `ходів ${st.turns}`)}
        {Stat(ui, 'kpi-calls', 'Виклики', String(calls), errors > 0 ? `помилок ${errors}` : `різних ${Object.keys(st.tools).length}`, errors > 0 ? 'warning' : 'text')}
        {Stat(ui, 'kpi-skills', 'Скіли', String(usedSkills), `із ${s?.skillsTotal ?? '—'} доступних`)}
        {Stat(ui, 'kpi-mcp', 'MCP', String(servers.size), 'серверів')}
        {Stat(ui, 'kpi-agents', 'Агенти', String(st.agents.length), 'запусків')}
        {Stat(ui, 'kpi-compact', 'Стиснення', String(st.compactions), 'контексту')}
      </Box>

      {Section(ui, 'Контекст', s ? `${fmtTok(s.ctx.tokens)} з ${fmtTok(s.ctx.window)}` : undefined, (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            {Meter(ui, s?.ctx.percent ?? 0, Math.max(10, Math.min(40, d.cols - 12)), ctxColor(s?.ctx.percent))}
            <Text tabular>{s?.ctx.percent ?? '—'}%</Text>
          </Box>
          {s?.autoCompactAt !== undefined && Dim(ui, `автостиснення на ${fmtTok(s.autoCompactAt)}`)}
        </Box>
      ))}

      {s !== null && s.rateLimits.length > 0 &&
        Section(ui, 'Ліміти', undefined, s.rateLimits.map((r, i) => (
          <Box key={keyOf('rl', r.kind, i)} flexDirection="row" gap={1}>
            <Box width={9}>
              <Text dimColor>{r.kind === 'five_hour' ? '5 годин' : r.kind === 'seven_day' ? '7 днів' : r.kind}</Text>
            </Box>
            {Meter(ui, r.percentUsed, Math.max(10, Math.min(30, d.cols - 24)), ctxColor(r.percentUsed))}
            <Text tabular>{r.percentUsed}%</Text>
          </Box>
        )))}

      {Section(ui, 'Найчастіші інструменти', top.length === 0 ? 'ще не було викликів' : undefined, top.map(([name, t], i) => (
        <Box key={keyOf('top', name, i)} flexDirection="row" gap={1}>
          <Box flexGrow={1} flexShrink={1} minWidth={8}>
            <Text wrap="truncate-end">{name.startsWith('mcp__') ? `${mcpServerOf(name)} › ${mcpToolOf(name)}` : name}</Text>
          </Box>
          {Meter(ui, (t.n / topMax) * 100, barW)}
          <Box width={4} justifyContent="flex-end">
            <Text tabular>{t.n}</Text>
          </Box>
          <Box width={7} justifyContent="flex-end">
            {t.errors > 0 ? (
              <Text color="error" size="footnote">
                ✗{t.errors}
              </Text>
            ) : (
              <Text dimColor size="footnote" tabular>
                {t.n > 0 && t.ms > 0 ? fmtMs(t.ms / t.n) : ''}
              </Text>
            )}
          </Box>
        </Box>
      )))}

      {Section(ui, 'Токени', 'від підключення мода', (
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          {[
            ['вхід', st.tokens.input],
            ['вихід', st.tokens.output],
            ['кеш-читання', st.tokens.cacheRead],
            ['кеш-запис', st.tokens.cacheWrite],
          ].map(([k, v]) => (
            <Text key={`tok-${k}`}>
              <Text dimColor size="footnote">
                {k}{' '}
              </Text>
              <Text tabular>{fmtTok(v as number)}</Text>
            </Text>
          ))}
        </Box>
      ))}

      {s !== null && Section(ui, 'Про сесію', undefined, (
        <Box flexDirection="column">
          {[
            ['ID', s.sessionId],
            ['Тека', s.cwd],
            ['Репозиторій', s.repo ?? 'не git'],
            ['Версія', s.version],
          ].map(([k, v]) => (
            <Box key={`about-${k}`} flexDirection="row" gap={1}>
              <Box width={12}>
                <Text dimColor size="footnote">
                  {k}
                </Text>
              </Box>
              <Text wrap="truncate-start" size="footnote">
                {v}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

// ── Skills ──────────────────────────────────────────────────────────────────

export const Skills = (ui: UI, d: Data, acts: Acts) => {
  const { Box, Text, Button } = ui
  const s = d.snap
  const st = d.stats
  const all = s?.skills ?? []
  const used = Object.entries(st.skills).sort((a, b) => b[1].last - a[1].last || b[1].n - a[1].n)
  const sources = new Map<string, number>()
  for (const k of all) sources.set(k.source, (sources.get(k.source) ?? 0) + 1)
  const shown = all
    .filter(k => d.skillSource === 'all' || k.source === d.skillSource)
    .sort((a, b) => Number(b.name in st.skills) - Number(a.name in st.skills) || a.name.localeCompare(b.name))
  const listTokens = all.reduce((n, k) => n + k.tokens, 0)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" marginTop={1}>
        {Stat(ui, 'sk-total', 'Доступно', String(s?.skillsTotal ?? '—'), `для моделі ${s?.skillsIncluded ?? '—'}`)}
        {Stat(ui, 'sk-tok', 'Займають', `~${fmtTok(listTokens)}`, 'токенів')}
        {Stat(ui, 'sk-used', 'Використано', String(used.length), 'у цій сесії', 'merged')}
      </Box>

      {Section(ui, 'Використані', used.length === 0 ? 'поки жодного' : undefined, used.map(([name, u], i) => (
        <Box key={keyOf('used', name, i)} flexDirection="row" gap={1}>
          <Text color="merged">●</Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">{name}</Text>
          </Box>
          <Text dimColor size="footnote">
            {u.pluginName ?? sourceLabel(u.source)}
          </Text>
          <Text tabular>{u.n}×</Text>
          <Box width={12} justifyContent="flex-end">
            <Text dimColor size="footnote">
              {u.last > 0 ? fmtAgo(u.last, d.now) : 'раніше'}
            </Text>
          </Box>
        </Box>
      )))}

      {Section(ui, 'Усі скіли', undefined, (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button
              key="src-all"
              label={`усі ${all.length}`}
              variant={d.skillSource === 'all' ? 'primary' : 'secondary'}
              onPress={() => acts.setSkillSource('all')}
            />
            {[...sources.entries()].map(([src, n]) => (
              <Button
                key={`src-${src}`}
                label={`${sourceLabel(src)} ${n}`}
                variant={d.skillSource === src ? 'primary' : 'secondary'}
                onPress={() => acts.setSkillSource(src)}
              />
            ))}
          </Box>
          {shown.length === 0 && Dim(ui, 'Немає даних — натисніть ↻.')}
          {shown.map((k, i) => (
            <Box key={keyOf('sk', k.name, i)} flexDirection="row" gap={1}>
              <Text color={k.name in st.skills ? 'merged' : 'inactive'}>{k.name in st.skills ? '●' : '○'}</Text>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end">{k.name}</Text>
              </Box>
              <Text dimColor size="footnote">
                {k.pluginName ?? sourceLabel(k.source)}
              </Text>
              <Box width={6} justifyContent="flex-end">
                <Text dimColor size="footnote" tabular>
                  {fmtTok(k.tokens)}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

// ── MCP ─────────────────────────────────────────────────────────────────────

export const Mcp = (ui: UI, d: Data) => {
  const { Box, Text } = ui
  const s = d.snap
  const st = d.stats
  type Server = { tools: string[]; loaded: number; tokens: number }
  const servers = new Map<string, Server>()
  const get = (name: string) => {
    const has = servers.get(name)
    if (has) return has
    const made: Server = { tools: [], loaded: 0, tokens: 0 }
    servers.set(name, made)
    return made
  }
  for (const t of s?.mcpTools ?? []) {
    const one = get(t.server)
    one.tools.push(mcpToolOf(t.name))
    one.tokens += t.tokens
    if (t.isLoaded) one.loaded += 1
  }
  if ((s?.mcpTools ?? []).length === 0) {
    for (const t of s?.tools ?? []) if (t.mcp) get(mcpServerOf(t.name) ?? t.name).tools.push(mcpToolOf(t.name))
  }
  for (const name of Object.keys(st.mcp)) get(name)
  const rows = [...servers.entries()].sort(
    (a, b) => (st.mcp[b[0]]?.n ?? 0) - (st.mcp[a[0]]?.n ?? 0) || a[0].localeCompare(b[0]),
  )
  const recent = d.events.filter(e => e.kind === 'mcp').slice(-10).reverse()

  return (
    <Box flexDirection="column">
      {Section(ui, 'Сервери', String(rows.length), [
        <Box key="mcp-head" flexDirection="row" gap={1}>
          <Box flexGrow={1}>
            <Text dimColor size="caption">
              сервер
            </Text>
          </Box>
          <Box width={9} justifyContent="flex-end">
            <Text dimColor size="caption">
              інструменти
            </Text>
          </Box>
          <Box width={7} justifyContent="flex-end">
            <Text dimColor size="caption">
              токени
            </Text>
          </Box>
          <Box width={7} justifyContent="flex-end">
            <Text dimColor size="caption">
              виклики
            </Text>
          </Box>
        </Box>,
        ...rows.map(([name, srv], i) => {
          const c = st.mcp[name]
          return (
            <Box key={keyOf('mcp', name, i)} flexDirection="row" gap={1}>
              <Text color={c && c.n > 0 ? 'ide' : 'inactive'}>{c && c.n > 0 ? '●' : '○'}</Text>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end">{name}</Text>
              </Box>
              <Box width={9} justifyContent="flex-end">
                <Text tabular>
                  {srv.loaded > 0 ? `${srv.loaded}/` : ''}
                  {srv.tools.length}
                </Text>
              </Box>
              <Box width={7} justifyContent="flex-end">
                <Text dimColor size="footnote" tabular>
                  {srv.tokens > 0 ? fmtTok(srv.tokens) : '—'}
                </Text>
              </Box>
              <Box width={7} justifyContent="flex-end">
                <Text tabular color={c && c.errors > 0 ? 'warning' : 'text'}>
                  {c?.n ?? 0}
                  {c && c.errors > 0 ? ` ✗${c.errors}` : ''}
                </Text>
              </Box>
            </Box>
          )
        }),
      ])}
      {Dim(ui, 'інструменти: завантажено / усього; решта підвантажується на вимогу')}

      {Section(ui, 'Останні виклики', recent.length === 0 ? 'ще не було' : undefined, recent.map((e, i) => (
        <Box key={keyOf('mcpc', e.id, i)} flexDirection="row" gap={1}>
          <Text color={e.isError ? 'error' : 'success'}>{e.isError ? '✗' : '✓'}</Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">{e.label}</Text>
          </Box>
          <Text dimColor size="footnote">
            {fmtMs(e.ms)} · {fmtAgo(e.at, d.now)}
          </Text>
        </Box>
      )))}
    </Box>
  )
}

// ── Agents ──────────────────────────────────────────────────────────────────

export const Agents = (ui: UI, d: Data) => {
  const { Box, Text } = ui
  const s = d.snap
  const st = d.stats
  const live = new Map((s?.liveAgents ?? []).map(a => [a.id, a]))
  const runs = [...st.agents].reverse()
  const byType = new Map<string, number>()
  for (const a of st.agents) byType.set(a.type, (byType.get(a.type) ?? 0) + 1)

  return (
    <Box flexDirection="column">
      {byType.size > 0 && (
        <Box flexDirection="row" gap={2} marginTop={1} flexWrap="wrap">
          {[...byType.entries()].map(([t, n]) => (
            <Text key={`bt-${t}`}>
              <Text color="warning">{t}</Text>
              <Text dimColor size="footnote">
                {' '}
                ×{n}
              </Text>
            </Text>
          ))}
        </Box>
      )}
      {Section(ui, 'Запуски', runs.length === 0 ? 'поки жодного' : undefined, runs.map((a, i) => {
        const status = live.get(a.id)?.status ?? a.status
        return (
          <Box key={keyOf('ag', a.id, i)} flexDirection="row" gap={1}>
            <Text color={statusColor(status)}>{statusIcon(status)}</Text>
            <Box width={16}>
              <Text color="warning" wrap="truncate-end">
                {a.type}
              </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{a.description || '—'}</Text>
            </Box>
            <Text dimColor size="footnote">
              {a.ms !== undefined ? fmtMs(a.ms) : status === 'running' ? 'працює' : ''}
            </Text>
          </Box>
        )
      }))}

      {Section(ui, 'Власні типи агентів', String((s?.customAgents ?? []).length), (s?.customAgents ?? []).map((a, i) => (
        <Box key={keyOf('ca', a.agentType, i)} flexDirection="row" gap={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">{a.agentType}</Text>
          </Box>
          <Text dimColor size="footnote">
            {sourceLabel(a.source)}
          </Text>
          <Box width={6} justifyContent="flex-end">
            <Text dimColor size="footnote" tabular>
              {fmtTok(a.tokens)}
            </Text>
          </Box>
        </Box>
      )))}
    </Box>
  )
}

// ── Plugins, hooks, commands, memory ────────────────────────────────────────

export const Plugins = (ui: UI, d: Data) => {
  const { Box, Text } = ui
  const s = d.snap
  const commands = s?.commands ?? []
  const bySource = new Map<string, string[]>()
  for (const c of commands) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c.name])
  const base = (name: string) => name.split('@')[0] ?? name

  return (
    <Box flexDirection="column">
      {Section(ui, 'Плагіни', `${(s?.plugins ?? []).filter(p => p.isEnabled).length} увімкнено`, (s?.plugins ?? []).map((p, i) => {
        const cmds = commands.filter(c => c.plugin !== undefined && base(p.name) === c.plugin).length
        const skills = (s?.skills ?? []).filter(k => k.pluginName !== undefined && base(p.name) === k.pluginName).length
        return (
          <Box key={keyOf('pl', p.name, i)} flexDirection="row" gap={1}>
            <Text color={p.isEnabled ? 'success' : 'inactive'}>{p.isEnabled ? '●' : '○'}</Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end" dimColor={!p.isEnabled}>
                {p.name}
              </Text>
            </Box>
            <Text dimColor size="footnote">
              {[skills > 0 ? `скілів ${skills}` : '', cmds > 0 ? `команд ${cmds}` : ''].filter(Boolean).join(' · ')}
            </Text>
          </Box>
        )
      }))}

      {Section(ui, 'Хуки з налаштувань', (s?.hooks ?? []).length === 0 ? 'не налаштовано' : undefined, (
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          {(s?.hooks ?? []).map(hook => (
            <Text key={`hook-${hook.event}`}>
              <Text color="permission">{hook.event}</Text>
              <Text dimColor size="footnote">
                {' '}
                ×{hook.count}
              </Text>
            </Text>
          ))}
        </Box>
      ))}

      {Section(ui, 'Слеш-команди', String(commands.length), [...bySource.entries()].map(([src, names], i) => (
        <Box key={keyOf('cmd', src, i)} flexDirection="row" gap={1}>
          <Box width={12}>
            <Text>{sourceLabel(src)}</Text>
          </Box>
          {Meter(ui, pct(names.length, commands.length), Math.max(6, Math.min(20, d.cols - 26)))}
          <Text tabular>{names.length}</Text>
        </Box>
      )))}

      {Section(ui, 'Пам’ять та інструкції', 'CLAUDE.md, правила', (s?.memoryFiles ?? []).map((f, i) => (
        <Box key={keyOf('mem', f.path, i)} flexDirection="row" gap={1}>
          <Box width={9}>
            <Text color="remember" size="footnote">
              {f.type}
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-start" size="footnote">
              {f.path}
            </Text>
          </Box>
          <Box width={6} justifyContent="flex-end">
            <Text dimColor size="footnote" tabular>
              {fmtTok(f.tokens)}
            </Text>
          </Box>
        </Box>
      )))}

      {s !== null && s.problems.length > 0 &&
        Section(ui, 'Не вдалося прочитати', undefined, s.problems.map((p, i) => (
          <Text key={`pr-${i}`} dimColor size="footnote">
            {clip(p, 200)}
          </Text>
        )))}
    </Box>
  )
}

// ── Context ─────────────────────────────────────────────────────────────────

const contextSvg = (s: DashSnap) => {
  const W = 640
  const used = s.categories.filter(c => c.kind !== 'deferred')
  const total = Math.max(1, s.ctxMax || used.reduce((n, c) => n + c.tokens, 0))
  let x = 0
  const segs: string[] = []
  const legend: string[] = []
  used.forEach((c, i) => {
    const w = (c.tokens / total) * W
    const color = c.kind === 'free' ? '#9993' : c.kind === 'buffer' ? '#9997' : PALETTE[i % PALETTE.length]
    segs.push(`<rect x="${x.toFixed(1)}" y="0" width="${Math.max(0.5, w).toFixed(1)}" height="14" fill="${color}"/>`)
    const col = i % 3
    const row = Math.floor(i / 3)
    legend.push(
      `<g transform="translate(${col * 214},${26 + row * 18})"><rect width="9" height="9" rx="2" fill="${color}"/><text x="15" y="9" font-size="11" font-family="system-ui,sans-serif" fill="#8a8a8a">${xml(clip(c.name, 22))} · ${fmtTok(c.tokens)}</text></g>`,
    )
    x += w
  })
  if (s.autoCompactAt !== undefined) {
    const ax = (s.autoCompactAt / total) * W
    segs.push(`<line x1="${ax.toFixed(1)}" x2="${ax.toFixed(1)}" y1="-3" y2="17" stroke="#e06c75" stroke-width="1.5"/>`)
  }
  const height = 26 + Math.ceil(used.length / 3) * 18
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -4 ${W} ${height + 4}" width="${W}" height="${height + 4}"><clipPath id="r"><rect width="${W}" height="14" rx="7"/></clipPath><g clip-path="url(#r)">${segs.filter(p => p.startsWith('<rect')).join('')}</g>${segs.filter(p => !p.startsWith('<rect')).join('')}${legend.join('')}</svg>`,
    alt: used.map(c => `${c.name} ${fmtTok(c.tokens)}`).join(', '),
  }
}

export const Context = (ui: UI, d: Data) => {
  const { Box, Text, Svg } = ui
  const s = d.snap
  const st = d.stats
  if (s === null) return Dim(ui, 'Немає знімка — натисніть ↻.')
  const total = Math.max(1, s.ctxMax)
  const cacheBase = st.tokens.input + st.tokens.cacheRead + st.tokens.cacheWrite

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" marginTop={1}>
        {Stat(ui, 'ctx-pct', 'Заповнено', `${s.ctx.percent ?? pct(s.ctxTotal, total)}%`, `вікно ${fmtTok(s.ctx.window)}`, ctxColor(s.ctx.percent))}
        {Stat(ui, 'ctx-tok', 'Токенів', fmtTok(s.ctx.tokens ?? s.ctxTotal), 'зараз у контексті')}
        {Stat(ui, 'ctx-cache', 'Кеш', `${pct(st.tokens.cacheRead, cacheBase)}%`, 'входу з кешу', 'success')}
        {Stat(ui, 'ctx-cmp', 'Стиснень', String(st.compactions), s.autoCompactAt !== undefined ? `поріг ${fmtTok(s.autoCompactAt)}` : 'авто вимкнено')}
      </Box>

      {Section(ui, 'Склад контексту', undefined, (
        <Box flexDirection="column">
          {Svg !== undefined && (() => {
            const svg = contextSvg(s)
            return <Svg source={svg.source} alt={svg.alt} />
          })()}
          {s.categories.map((c, i) => (
            <Box key={keyOf('cat', c.name, i)} flexDirection="row" gap={1}>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end" dimColor={c.kind !== 'used'}>
                  {c.name}
                </Text>
              </Box>
              {Meter(ui, pct(c.tokens, total), Math.max(6, Math.min(20, d.cols - 34)), c.kind === 'used' ? 'claude' : 'inactive')}
              <Box width={6} justifyContent="flex-end">
                <Text tabular>{fmtTok(c.tokens)}</Text>
              </Box>
              <Box width={5} justifyContent="flex-end">
                <Text dimColor size="footnote" tabular>
                  {pct(c.tokens, total)}%
                </Text>
              </Box>
            </Box>
          ))}
          {Dim(ui, 'тьмяні рядки — вільне місце, запас і схеми, що підвантажуються на вимогу')}
        </Box>
      ))}
    </Box>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────

const LANES: { id: string; label: string; kinds: string[] }[] = [
  { id: 'prompt', label: 'Промпти', kinds: ['prompt'] },
  { id: 'turn', label: 'Ходи', kinds: ['turn'] },
  { id: 'tool', label: 'Інструменти', kinds: ['tool', 'search'] },
  { id: 'skill', label: 'Скіли', kinds: ['skill'] },
  { id: 'mcp', label: 'MCP', kinds: ['mcp'] },
  { id: 'agent', label: 'Агенти', kinds: ['agent'] },
  { id: 'other', label: 'Сесія', kinds: ['session', 'compact'] },
]

const timelineSvg = (events: DashEvent[], t0: number, t1: number) => {
  const L = 84
  const W = 640
  const plot = W - L - 8
  const laneH = 18
  const span = Math.max(1000, t1 - t0)
  const X = (t: number) => L + ((t - t0) / span) * plot
  const parts: string[] = []
  LANES.forEach((lane, i) => {
    const y = i * laneH
    parts.push(
      `<line x1="${L}" x2="${W - 8}" y1="${y + laneH / 2}" y2="${y + laneH / 2}" stroke="#8883"/>`,
      `<text x="0" y="${y + 13}" font-size="11" font-family="system-ui,sans-serif" fill="#8a8a8a">${lane.label}</text>`,
    )
  })
  for (const e of events) {
    const lane = LANES.findIndex(l => l.kinds.includes(e.kind))
    if (lane === -1) continue
    const y = lane * laneH
    const color = e.isError ? '#e06c75' : KIND_COLOR[e.kind] ?? '#999'
    if (e.ms !== undefined && e.ms > 0) {
      const w = Math.max(3, X(e.at + e.ms) - X(e.at))
      parts.push(
        `<rect x="${X(e.at).toFixed(1)}" y="${y + 5}" width="${w.toFixed(1)}" height="${laneH - 10}" rx="2" fill="${color}" fill-opacity="${e.isSub ? 0.5 : 0.85}"/>`,
      )
    } else {
      parts.push(`<circle cx="${X(e.at).toFixed(1)}" cy="${y + laneH / 2}" r="3" fill="${color}"/>`)
    }
  }
  const axisY = LANES.length * laneH + 2
  for (let k = 0; k <= 4; k++) {
    const t = t0 + (span * k) / 4
    parts.push(
      `<text x="${X(t).toFixed(1)}" y="${axisY + 11}" font-size="10" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" font-family="system-ui,sans-serif" fill="#8a8a8a">+${fmtMs(t - t0)}</text>`,
    )
  }
  const H = axisY + 16
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`
}

/** A one-row strip per lane, for surfaces without Svg. */
const textLanes = (ui: UI, events: DashEvent[], t0: number, t1: number, width: number) => {
  const { Box, Text } = ui
  const span = Math.max(1000, t1 - t0)
  return LANES.map(lane => {
    const cells = Array.from({ length: width }, () => '─')
    let hits = 0
    for (const e of events) {
      if (!lane.kinds.includes(e.kind)) continue
      const c = Math.min(width - 1, Math.floor(((e.at - t0) / span) * width))
      cells[c] = e.isError ? '✗' : '●'
      hits += 1
    }
    return (
      <Box key={`lane-${lane.id}`} flexDirection="row" gap={1}>
        <Box width={12}>
          <Text dimColor size="footnote">
            {lane.label}
          </Text>
        </Box>
        <Text color={hits > 0 ? KIND_THEME[lane.kinds[0] ?? 'tool'] : 'inactive'} mono>
          {cells.join('')}
        </Text>
      </Box>
    )
  })
}

export const Timeline = (ui: UI, d: Data) => {
  const { Box, Text, Svg } = ui
  const st = d.stats
  const ev = d.events
  const t0 = ev[0]?.at ?? st.loadedAt
  const t1 = Math.max(d.now, ...ev.map(e => e.at + (e.ms ?? 0)))
  const counts = new Map<string, number>()
  for (const e of ev) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1)
  const recent = ev.slice(-60).reverse()

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={2} marginTop={1} flexWrap="wrap">
        {[...counts.entries()].map(([k, n]) => (
          <Text key={`cnt-${k}`}>
            <Text color={KIND_THEME[k]}>●</Text>
            <Text dimColor size="footnote">
              {' '}
              {KIND_LABEL[k] ?? k} {n}
            </Text>
          </Text>
        ))}
      </Box>
      {Section(ui, 'Шкала часу', `за ${fmtMs(t1 - t0)}`, (
        Svg !== undefined ? (
          <Svg source={timelineSvg(ev, t0, t1)} alt={`Шкала подій: ${ev.length} подій за ${fmtMs(t1 - t0)}`} />
        ) : (
          <Box flexDirection="column">{textLanes(ui, ev, t0, t1, Math.max(10, Math.min(70, d.cols - 16)))}</Box>
        )
      ))}
      {st.backfilled > 0 && Dim(ui, `ще ${st.backfilled} викликів були до підключення мода — без часу, тож на шкалі їх немає`)}
      {Section(ui, 'Останні події', recent.length === 0 ? 'ще нічого' : 'новіші вгорі', recent.map((e, i) => (
        <Box key={keyOf('ev', e.id, i)} flexDirection="row" gap={1}>
          <Box width={8}>
            <Text dimColor size="footnote" tabular>
              +{fmtMs(e.at - t0)}
            </Text>
          </Box>
          <Text color={e.isError ? 'error' : KIND_THEME[e.kind]}>●</Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end" dimColor={e.isSub}>
              {e.isSub ? '↳ ' : ''}
              {e.label}
            </Text>
          </Box>
          <Text dimColor size="footnote">
            {e.ms !== undefined ? fmtMs(e.ms) : ''}
          </Text>
        </Box>
      )))}
    </Box>
  )
}
