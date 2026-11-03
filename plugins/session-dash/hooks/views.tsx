import type { Elements, RenderElement } from 'claude-code'

import type { DashEvent, DashSnap, DashStats } from '../types'
import {
  KIND_COLOR,
  KIND_LABEL,
  KIND_THEME,
  PALETTE,
  bar,
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
  { id: 'plugins', label: 'Плагіни й хуки', hotkey: '5' },
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

const Section = (ui: UI, title: string, hint: string | undefined, body: RenderElement | RenderElement[]) => {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" gap={1}>
        <Text weight="semibold" color="claude">
          {title}
        </Text>
        {hint !== undefined && <Text dimColor>{hint}</Text>}
      </Box>
      {body}
    </Box>
  )
}

/** A row that reveals `detail` under itself while the pointer is over it. */
const HoverRow = (ui: UI, key: string, row: RenderElement, detail: string | undefined) => {
  const { Box, Text } = ui
  return (
    <Box key={key} flexDirection="column">
      {row}
      {detail !== undefined && detail !== '' && (
        <Box display="none" hover={{ display: 'flex' }} paddingLeft={2}>
          <Text dimColor wrap="wrap">
            ↳ {detail}
          </Text>
        </Box>
      )}
    </Box>
  )
}

const Tile = (ui: UI, key: string, label: string, value: string, hint: string, color = 'text') => {
  const { Box, Text } = ui
  return (
    <Box
      key={key}
      flexDirection="column"
      borderStyle="round"
      borderColor="inactive"
      hover={{ borderColor: 'claude' }}
      paddingX={1}
      minWidth={16}
    >
      <Text dimColor size="caption">
        {label}
      </Text>
      <Text size="title" weight="bold" color={color} tabular>
        {value}
      </Text>
      <Box display="none" hover={{ display: 'flex' }}>
        <Text dimColor size="footnote" wrap="wrap">
          {hint}
        </Text>
      </Box>
    </Box>
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
        <Text color="claude" weight="bold">
          ◆ Сесія
        </Text>
        <Text>{s?.model ?? '—'}</Text>
        <Text dimColor>· {fmtMs(up)}</Text>
        <Text dimColor>· {fmtUsd(s?.costUsd)}</Text>
        <Text color={ctxColor(s?.ctx.percent)}>· контекст {s?.ctx.percent ?? '—'}%</Text>
        <Text dimColor>· оновлено {s ? fmtAgo(s.at, d.now) : 'ще ні'}</Text>
      </Box>
      <Box flexDirection="row" gap={1} flexWrap="wrap" marginTop={1}>
        {TABS.map(t => (
          <Button
            key={`tab-${t.id}`}
            label={t.label}
            hotkey={t.hotkey}
            variant={t.id === tab ? 'primary' : 'secondary'}
            dimColor={t.id === tab ? undefined : true}
            onPress={() => acts.setTab(t.id)}
          />
        ))}
        <Button key="refresh" label={isRefreshing ? 'Оновлюю…' : '↻ Оновити'} hotkey="r" onPress={() => acts.refresh()} />
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
  const barW = Math.max(6, Math.min(24, d.cols - 46))

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
        {Tile(ui, 'kpi-up', 'Тривалість', fmtMs(s ? d.now - s.startedAt : undefined), 'Від першого запуску сесії')}
        {Tile(ui, 'kpi-prompts', 'Промпти', String(st.prompts), `Ходів моделі: ${st.turns}, разом ${fmtMs(st.turnMs)}`)}
        {Tile(
          ui,
          'kpi-calls',
          'Виклики інстр.',
          String(calls),
          `Помилок: ${errors}. Різних інструментів: ${Object.keys(st.tools).length}`,
          errors > 0 ? 'warning' : 'text',
        )}
        {Tile(ui, 'kpi-skills', 'Скіли', `${usedSkills}/${s?.skillsTotal ?? '—'}`, 'Використано в сесії / доступно')}
        {Tile(
          ui,
          'kpi-mcp',
          'MCP сервери',
          String(servers.size),
          `Інструментів MCP: ${(s?.tools ?? []).filter(t => t.mcp).length}, викликів: ${Object.values(st.mcp).reduce((n, m) => n + m.n, 0)}`,
        )}
        {Tile(ui, 'kpi-agents', 'Агенти', String(st.agents.length), `Зараз активних: ${(s?.liveAgents ?? []).filter(a => a.status === 'running').length}`)}
        {Tile(ui, 'kpi-cost', 'Вартість', fmtUsd(s?.costUsd), `Вихідних токенів: ${fmtTok(st.tokens.output)}`)}
        {Tile(ui, 'kpi-compact', 'Стиснення', String(st.compactions), 'Скільки разів контекст стискали (compact)')}
      </Box>

      {Section(ui, 'Контекстне вікно', s ? `${fmtTok(s.ctx.tokens)} з ${fmtTok(s.ctx.window)}` : undefined, (
        <Box flexDirection="column">
          <Text color={ctxColor(s?.ctx.percent)} mono>
            {bar(s?.ctx.percent ?? 0, Math.max(10, Math.min(48, d.cols - 12)))} {s?.ctx.percent ?? '—'}%
          </Text>
          {s?.autoCompactAt !== undefined && (
            <Text dimColor>Автостиснення (auto-compact) на {fmtTok(s.autoCompactAt)} токенів</Text>
          )}
        </Box>
      ))}

      {s !== null && s.rateLimits.length > 0 &&
        Section(ui, 'Ліміти використання', undefined, s.rateLimits.map((r, i) => (
          HoverRow(
            ui,
            keyOf('rl', r.kind, i),
            <Box flexDirection="row" gap={1}>
              <Box width={12}>
                <Text>{r.kind === 'five_hour' ? '5 годин' : r.kind === 'seven_day' ? '7 днів' : r.kind}</Text>
              </Box>
              <Text color={ctxColor(r.percentUsed)} mono>
                {bar(r.percentUsed, Math.max(10, Math.min(30, d.cols - 24)))}
              </Text>
              <Text tabular>{r.percentUsed}%</Text>
            </Box>,
            r.resetsAt !== undefined ? `Скидання: ${r.resetsAt}` : undefined,
          )
        )))}

      {Section(ui, 'Найчастіші інструменти', top.length === 0 ? 'ще не було викликів' : 'наведіть для деталей', top.map(([name, t], i) =>
        HoverRow(
          ui,
          keyOf('top', name, i),
          <Box flexDirection="row" gap={1}>
            <Box flexGrow={1} flexShrink={1} minWidth={8}>
              <Text wrap="truncate-end" hover={{ color: 'claude' }}>
                {name.startsWith('mcp__') ? `${mcpServerOf(name)} › ${mcpToolOf(name)}` : name}
              </Text>
            </Box>
            <Text color="claude" mono>
              {bar((t.n / topMax) * 100, barW)}
            </Text>
            <Box width={5} justifyContent="flex-end">
              <Text tabular>{t.n}</Text>
            </Box>
            {t.errors > 0 ? <Text color="error">✗{t.errors}</Text> : <Text> </Text>}
          </Box>,
          `Середній час: ${t.n > 0 && t.ms > 0 ? fmtMs(t.ms / t.n) : '—'} · помилок: ${t.errors} · останній: ${t.last > 0 ? fmtAgo(t.last, d.now) : 'до підключення мода'}`,
        ),
      ))}

      {Section(ui, 'Токени за сесію', 'з відповідей моделі після підключення мода', (
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          <Text>
            <Text dimColor>вхід </Text>
            {fmtTok(st.tokens.input)}
          </Text>
          <Text>
            <Text dimColor>вихід </Text>
            {fmtTok(st.tokens.output)}
          </Text>
          <Text>
            <Text dimColor>кеш-читання </Text>
            {fmtTok(st.tokens.cacheRead)}
          </Text>
          <Text>
            <Text dimColor>кеш-запис </Text>
            {fmtTok(st.tokens.cacheWrite)}
          </Text>
        </Box>
      ))}

      {s !== null && Section(ui, 'Про сесію', undefined, (
        <Box flexDirection="column">
          {[
            ['ID', s.sessionId],
            ['Тека', s.cwd],
            ['Репозиторій', s.repo ?? 'не git'],
            ['Claude Code', s.version],
            ['Поверхні', s.surfaces.join(', ') || '—'],
          ].map(([k, v]) => (
            <Box flexDirection="row" gap={1}>
              <Box width={13}>
                <Text dimColor>{k}</Text>
              </Box>
              <Text wrap="truncate-start">{v}</Text>
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
      <Box marginTop={1} flexDirection="row" gap={2} flexWrap="wrap">
        <Text>
          <Text dimColor>доступно </Text>
          <Text weight="bold">{s?.skillsTotal ?? '—'}</Text>
        </Text>
        <Text>
          <Text dimColor>у списку для моделі </Text>
          <Text weight="bold">{s?.skillsIncluded ?? '—'}</Text>
        </Text>
        <Text>
          <Text dimColor>займає </Text>
          <Text weight="bold">~{fmtTok(listTokens)}</Text>
          <Text dimColor> токенів</Text>
        </Text>
        <Text>
          <Text dimColor>використано </Text>
          <Text weight="bold" color="merged">
            {used.length}
          </Text>
        </Text>
      </Box>

      {Section(ui, 'Використані в цій сесії', used.length === 0 ? 'поки жодного' : undefined, used.map(([name, u], i) =>
        HoverRow(
          ui,
          keyOf('used', name, i),
          <Box flexDirection="row" gap={1}>
            <Text color="merged">●</Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end" weight="medium" hover={{ color: 'claude' }}>
                {name}
              </Text>
            </Box>
            <Text tabular>{u.n}×</Text>
            <Text dimColor>{u.last > 0 ? fmtAgo(u.last, d.now) : 'раніше'}</Text>
          </Box>,
          [
            `джерело: ${sourceLabel(u.source)}`,
            u.pluginName !== undefined ? `плагін: ${u.pluginName}` : undefined,
            u.path !== undefined ? `файл: ${u.path}` : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      ))}

      {Section(ui, 'Усі доступні скіли', 'фільтр за джерелом:', (
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
          {shown.length === 0 && <Text dimColor>Немає даних — натисніть «Оновити».</Text>}
          {shown.map((k, i) =>
            HoverRow(
              ui,
              keyOf('sk', k.name, i),
              <Box flexDirection="row" gap={1}>
                <Text color={k.name in st.skills ? 'merged' : 'inactive'}>{k.name in st.skills ? '●' : '○'}</Text>
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate-end" hover={{ color: 'claude' }}>
                    {k.name}
                  </Text>
                </Box>
                <Text dimColor>{k.pluginName ?? sourceLabel(k.source)}</Text>
                <Box width={6} justifyContent="flex-end">
                  <Text dimColor tabular>
                    {fmtTok(k.tokens)}
                  </Text>
                </Box>
              </Box>,
              `джерело: ${sourceLabel(k.source)}${k.pluginName ? ` (плагін ${k.pluginName})` : ''} · опис у контексті ≈ ${k.tokens} токенів${
                st.skills[k.name] ? ` · викликано ${st.skills[k.name]!.n}×` : ' · у цій сесії не викликався'
              }`,
            ),
          )}
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
      {Section(ui, 'Підключені сервери', `${rows.length} · наведіть, щоб побачити інструменти`, [
        <Box flexDirection="row" gap={1}>
          <Box flexGrow={1}>
            <Text dimColor size="caption">сервер</Text>
          </Box>
          <Box width={9} justifyContent="flex-end">
            <Text dimColor size="caption">інстр.</Text>
          </Box>
          <Box width={9} justifyContent="flex-end">
            <Text dimColor size="caption">токени</Text>
          </Box>
          <Box width={8} justifyContent="flex-end">
            <Text dimColor size="caption">виклики</Text>
          </Box>
        </Box>,
        ...rows.map(([name, srv], i) => {
          const c = st.mcp[name]
          const perTool = Object.entries(st.tools)
            .filter(([t]) => mcpServerOf(t) === name)
            .map(([t, v]) => `${mcpToolOf(t)} ×${v.n}`)
          return HoverRow(
            ui,
            keyOf('mcp', name, i),
            <Box flexDirection="row" gap={1}>
              <Text color={c && c.n > 0 ? 'ide' : 'inactive'}>{c && c.n > 0 ? '●' : '○'}</Text>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end" hover={{ color: 'claude' }}>
                  {name}
                </Text>
              </Box>
              <Box width={9} justifyContent="flex-end">
                <Text tabular>
                  {srv.loaded > 0 ? `${srv.loaded}/` : ''}
                  {srv.tools.length}
                </Text>
              </Box>
              <Box width={9} justifyContent="flex-end">
                <Text dimColor tabular>
                  {srv.tokens > 0 ? fmtTok(srv.tokens) : '—'}
                </Text>
              </Box>
              <Box width={8} justifyContent="flex-end">
                <Text tabular color={c && c.errors > 0 ? 'warning' : 'text'}>
                  {c?.n ?? 0}
                  {c && c.errors > 0 ? ` ✗${c.errors}` : ''}
                </Text>
              </Box>
            </Box>,
            [
              perTool.length > 0 ? `викликано: ${perTool.join(', ')}` : undefined,
              srv.tools.length > 0
                ? `інструменти (${srv.loaded} завантажено з ${srv.tools.length}): ${clip(srv.tools.join(', '), 600)}`
                : undefined,
              c && c.n > 0 && c.ms > 0 ? `середній час: ${fmtMs(c.ms / c.n)}` : undefined,
            ]
              .filter(Boolean)
              .join('\n↳ '),
          )
        }),
      ])}
      <Text dimColor size="footnote">
        «інстр.» — завантажено/усього: решта схем відкладена (deferred) і підвантажується через пошук інструментів.
      </Text>

      {Section(ui, 'Останні виклики MCP', recent.length === 0 ? 'після підключення мода ще не було' : undefined, recent.map((e, i) =>
        HoverRow(
          ui,
          keyOf('mcpc', e.id, i),
          <Box flexDirection="row" gap={1}>
            <Text color={e.isError ? 'error' : 'success'}>{e.isError ? '✗' : '✓'}</Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{e.label}</Text>
            </Box>
            <Text dimColor>{fmtMs(e.ms)}</Text>
            <Text dimColor>{fmtAgo(e.at, d.now)}</Text>
          </Box>,
          e.detail,
        ),
      ))}
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
            <Text>
              <Text color="warning">{t}</Text>
              <Text dimColor> ×{n}</Text>
            </Text>
          ))}
        </Box>
      )}
      {Section(ui, 'Запуски агентів у сесії', runs.length === 0 ? 'поки жодного' : undefined, runs.map((a, i) => {
        const status = live.get(a.id)?.status ?? a.status
        return HoverRow(
          ui,
          keyOf('ag', a.id, i),
          <Box flexDirection="row" gap={1}>
            <Text color={statusColor(status)}>{statusIcon(status)}</Text>
            <Box width={18}>
              <Text color="warning" wrap="truncate-end">
                {a.type}
              </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end" hover={{ color: 'claude' }}>
                {a.description || '—'}
              </Text>
            </Box>
            <Text dimColor>{a.ms !== undefined ? fmtMs(a.ms) : status === 'running' ? 'працює' : ''}</Text>
          </Box>,
          `стан: ${status} · id: ${a.id}${a.at > 0 ? ` · запущено ${fmtAgo(a.at, d.now)}` : ' · запущено до підключення мода'}`,
        )
      }))}

      {Section(ui, 'Власні типи агентів', `${(s?.customAgents ?? []).length} · вбудовані не показано`, (s?.customAgents ?? []).map((a, i) =>
        HoverRow(
          ui,
          keyOf('ca', a.agentType, i),
          <Box flexDirection="row" gap={1}>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end" hover={{ color: 'claude' }}>
                {a.agentType}
              </Text>
            </Box>
            <Text dimColor>{sourceLabel(a.source)}</Text>
            <Box width={6} justifyContent="flex-end">
              <Text dimColor tabular>
                {fmtTok(a.tokens)}
              </Text>
            </Box>
          </Box>,
          `опис агента в контексті ≈ ${a.tokens} токенів`,
        ),
      ))}
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
        const cmds = commands.filter(c => c.plugin !== undefined && base(p.name) === c.plugin).map(c => `/${c.name}`)
        const skills = (s?.skills ?? []).filter(k => k.pluginName !== undefined && base(p.name) === k.pluginName)
        return HoverRow(
          ui,
          keyOf('pl', p.name, i),
          <Box flexDirection="row" gap={1}>
            <Text color={p.isEnabled ? 'success' : 'inactive'}>{p.isEnabled ? '●' : '○'}</Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end" dimColor={!p.isEnabled} hover={{ color: 'claude' }}>
                {p.name}
              </Text>
            </Box>
            <Text dimColor>
              {skills.length > 0 ? `скілів ${skills.length}` : ''}
              {skills.length > 0 && cmds.length > 0 ? ' · ' : ''}
              {cmds.length > 0 ? `команд ${cmds.length}` : ''}
            </Text>
          </Box>,
          [
            p.isEnabled ? 'увімкнено' : 'вимкнено',
            skills.length > 0 ? `скіли: ${clip(skills.map(k => k.name).join(', '), 300)}` : undefined,
            cmds.length > 0 ? `команди: ${clip(cmds.join(' '), 300)}` : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
        )
      }))}

      {Section(ui, 'Хуки з налаштувань', (s?.hooks ?? []).length === 0 ? 'не налаштовано' : 'подія → кількість', (
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          {(s?.hooks ?? []).map(h => (
            <Text>
              <Text color="permission">{h.event}</Text>
              <Text dimColor> ×{h.count}</Text>
            </Text>
          ))}
        </Box>
      ))}

      {Section(ui, 'Слеш-команди', `${commands.length} · наведіть для списку`, [...bySource.entries()].map(([src, names], i) =>
        HoverRow(
          ui,
          keyOf('cmd', src, i),
          <Box flexDirection="row" gap={1}>
            <Box width={14}>
              <Text hover={{ color: 'claude' }}>{sourceLabel(src)}</Text>
            </Box>
            <Text color="claude" mono>
              {bar(pct(names.length, commands.length), Math.max(6, Math.min(24, d.cols - 26)))}
            </Text>
            <Text tabular>{names.length}</Text>
          </Box>,
          clip(names.map(n => `/${n}`).join(' '), 700),
        ),
      ))}

      {Section(ui, 'Файли пам’яті та інструкцій', 'CLAUDE.md, правила, автопам’ять', (s?.memoryFiles ?? []).map((f, i) =>
        HoverRow(
          ui,
          keyOf('mem', f.path, i),
          <Box flexDirection="row" gap={1}>
            <Box width={9}>
              <Text color="remember">{f.type}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-start" hover={{ color: 'claude' }}>
                {f.path}
              </Text>
            </Box>
            <Box width={6} justifyContent="flex-end">
              <Text dimColor tabular>
                {fmtTok(f.tokens)}
              </Text>
            </Box>
          </Box>,
          `${f.path} · ≈ ${f.tokens} токенів`,
        ),
      ))}

      {s !== null && s.problems.length > 0 &&
        Section(ui, 'Що не вдалося прочитати', undefined, s.problems.map(p => <Text dimColor>{clip(p, 200)}</Text>))}
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
    const tip = xml(`${c.name}: ${fmtTok(c.tokens)} токенів (${pct(c.tokens, total)}%)`)
    segs.push(
      `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(0.5, w).toFixed(1)}" height="28" rx="3" fill="${color}"><title>${tip}</title></rect>`,
    )
    const col = i % 3
    const row = Math.floor(i / 3)
    legend.push(
      `<g transform="translate(${col * 214},${40 + row * 20})"><rect width="11" height="11" rx="2" fill="${color}"/><text x="17" y="10" font-size="12" font-family="system-ui,sans-serif" fill="#8a8a8a">${xml(clip(c.name, 22))} · ${fmtTok(c.tokens)}</text><title>${tip}</title></g>`,
    )
    x += w
  })
  if (s.autoCompactAt !== undefined) {
    const ax = (s.autoCompactAt / total) * W
    segs.push(
      `<line x1="${ax.toFixed(1)}" x2="${ax.toFixed(1)}" y1="-4" y2="32" stroke="#e06c75" stroke-width="2" stroke-dasharray="3 2"><title>${xml(`Поріг автостиснення: ${fmtTok(s.autoCompactAt)}`)}</title></line>`,
    )
  }
  const h = 40 + Math.ceil(used.length / 3) * 20 + 6
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -6 ${W} ${h + 6}" width="${W}" height="${h + 6}">${segs.join('')}${legend.join('')}</svg>`,
    alt: used.map(c => `${c.name} ${fmtTok(c.tokens)}`).join(', '),
  }
}

export const Context = (ui: UI, d: Data) => {
  const { Box, Text, Svg } = ui
  const s = d.snap
  const st = d.stats
  if (s === null) return <Text dimColor>Немає знімка — натисніть «Оновити».</Text>
  const total = Math.max(1, s.ctxMax)
  const cacheBase = st.tokens.input + st.tokens.cacheRead + st.tokens.cacheWrite
  const svg = contextSvg(s)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={2} marginTop={1} flexWrap="wrap">
        {Tile(ui, 'ctx-pct', 'Заповнено', `${s.ctx.percent ?? pct(s.ctxTotal, total)}%`, 'Частка вікна за останньою відповіддю моделі', ctxColor(s.ctx.percent))}
        {Tile(ui, 'ctx-tok', 'Токенів', fmtTok(s.ctx.tokens ?? s.ctxTotal), `Вікно моделі: ${fmtTok(s.ctx.window)}`)}
        {Tile(ui, 'ctx-cache', 'Кеш', `${pct(st.tokens.cacheRead, cacheBase)}%`, 'Частка вхідних токенів, прочитаних із кешу підказок (prompt cache)', 'success')}
        {Tile(ui, 'ctx-cmp', 'Стиснень', String(st.compactions), s.autoCompactAt !== undefined ? `Автостиснення на ${fmtTok(s.autoCompactAt)}` : 'Автостиснення вимкнено')}
      </Box>

      {Section(ui, 'З чого складається контекст', Svg ? 'наведіть на смугу' : undefined, (
        <Box flexDirection="column">
          {Svg !== undefined ? (
            <Svg source={svg.source} alt={svg.alt} isInteractive />
          ) : (
            <Text dimColor>Графік доступний у застосунку; нижче — таблиця.</Text>
          )}
          {s.categories.map((c, i) =>
            HoverRow(
              ui,
              keyOf('cat', c.name, i),
              <Box flexDirection="row" gap={1}>
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate-end" dimColor={c.kind !== 'used'} hover={{ color: 'claude' }}>
                    {c.name}
                  </Text>
                </Box>
                <Text color={c.kind === 'used' ? 'claude' : 'inactive'} mono>
                  {bar(pct(c.tokens, total), Math.max(6, Math.min(24, d.cols - 34)))}
                </Text>
                <Box width={7} justifyContent="flex-end">
                  <Text tabular>{fmtTok(c.tokens)}</Text>
                </Box>
                <Box width={5} justifyContent="flex-end">
                  <Text dimColor tabular>
                    {pct(c.tokens, total)}%
                  </Text>
                </Box>
              </Box>,
              c.kind === 'deferred'
                ? 'Схеми інструментів, що підвантажуються на вимогу: у вікно не входять'
                : c.kind === 'free'
                  ? 'Вільне місце у вікні'
                  : c.kind === 'buffer'
                    ? 'Запас під автостиснення'
                    : `${c.tokens} токенів`,
            ),
          )}
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
  const L = 92
  const W = 640
  const plot = W - L - 8
  const laneH = 22
  const span = Math.max(1000, t1 - t0)
  const X = (t: number) => L + ((t - t0) / span) * plot
  const parts: string[] = []
  LANES.forEach((lane, i) => {
    const y = i * laneH
    parts.push(
      `<rect x="${L}" y="${y + 2}" width="${plot}" height="${laneH - 4}" rx="4" fill="#8881"/>`,
      `<text x="0" y="${y + 15}" font-size="12" font-family="system-ui,sans-serif" fill="#8a8a8a">${lane.label}</text>`,
    )
  })
  for (const e of events) {
    const lane = LANES.findIndex(l => l.kinds.includes(e.kind))
    if (lane === -1) continue
    const y = lane * laneH
    const color = e.isError ? '#e06c75' : KIND_COLOR[e.kind] ?? '#999'
    const tip = xml(
      `${KIND_LABEL[e.kind] ?? e.kind}: ${e.label}\n+${fmtMs(e.at - t0)}${e.ms !== undefined ? ` · ${fmtMs(e.ms)}` : ''}${e.isError ? ' · помилка' : ''}${e.detail ? `\n${clip(e.detail, 200)}` : ''}`,
    )
    if (e.ms !== undefined && e.ms > 0) {
      const w = Math.max(3, X(e.at + e.ms) - X(e.at))
      parts.push(
        `<rect x="${X(e.at).toFixed(1)}" y="${y + 5}" width="${w.toFixed(1)}" height="${laneH - 10}" rx="2" fill="${color}" fill-opacity="${e.isSub ? 0.55 : 0.9}"><title>${tip}</title></rect>`,
      )
    } else {
      parts.push(
        `<circle cx="${X(e.at).toFixed(1)}" cy="${y + laneH / 2}" r="4" fill="${color}"><title>${tip}</title></circle>`,
      )
    }
  }
  const axisY = LANES.length * laneH + 4
  for (let k = 0; k <= 4; k++) {
    const t = t0 + (span * k) / 4
    const x = X(t)
    parts.push(
      `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="0" y2="${axisY}" stroke="#8883"/>`,
      `<text x="${x.toFixed(1)}" y="${axisY + 13}" font-size="11" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" font-family="system-ui,sans-serif" fill="#8a8a8a">+${fmtMs(t - t0)}</text>`,
    )
  }
  const H = axisY + 18
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`
}

/** A one-row strip per lane, for surfaces without Svg. */
const textLanes = (ui: UI, events: DashEvent[], t0: number, t1: number, width: number) => {
  const { Box, Text } = ui
  const span = Math.max(1000, t1 - t0)
  return LANES.map(lane => {
    const cells = Array.from({ length: width }, () => '·')
    for (const e of events) {
      if (!lane.kinds.includes(e.kind)) continue
      const c = Math.min(width - 1, Math.floor(((e.at - t0) / span) * width))
      cells[c] = e.isError ? '✗' : '●'
    }
    return (
      <Box flexDirection="row" gap={1}>
        <Box width={12}>
          <Text dimColor>{lane.label}</Text>
        </Box>
        <Text color={KIND_THEME[lane.kinds[0] ?? 'tool']} mono>
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
          <Text>
            <Text color={KIND_THEME[k]}>● {KIND_LABEL[k] ?? k}</Text>
            <Text dimColor> {n}</Text>
          </Text>
        ))}
      </Box>
      {st.backfilled > 0 && (
        <Text dimColor size="footnote">
          До підключення мода було {st.backfilled} викликів інструментів — вони враховані в лічильниках, але без часу, тож на шкалі їх немає.
        </Text>
      )}
      {Section(ui, 'Шкала часу', `від ${fmtAgo(t0, d.now).replace(' тому', '')} тому до зараз${Svg ? ' · наведіть на позначку' : ''}`, (
        Svg !== undefined ? (
          <Svg
            source={timelineSvg(ev, t0, t1)}
            alt={`Шкала подій: ${ev.length} подій за ${fmtMs(t1 - t0)}`}
            isInteractive
          />
        ) : (
          <Box flexDirection="column">{textLanes(ui, ev, t0, t1, Math.max(10, Math.min(80, d.cols - 16)))}</Box>
        )
      ))}
      {Section(ui, 'Останні події', recent.length === 0 ? 'ще нічого' : 'новіші вгорі · наведіть для деталей', recent.map((e, i) =>
        HoverRow(
          ui,
          keyOf('ev', e.id, i),
          <Box flexDirection="row" gap={1}>
            <Box width={9}>
              <Text dimColor tabular>
                +{fmtMs(e.at - t0)}
              </Text>
            </Box>
            <Box width={12}>
              <Text color={e.isError ? 'error' : KIND_THEME[e.kind]}>{KIND_LABEL[e.kind] ?? e.kind}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end" dimColor={e.isSub} hover={{ color: 'claude' }}>
                {e.isSub ? '↳ ' : ''}
                {e.label}
              </Text>
            </Box>
            <Text dimColor>{e.ms !== undefined ? fmtMs(e.ms) : ''}</Text>
          </Box>,
          [e.detail, e.isSub ? 'усередині субагента' : undefined, e.isError ? 'завершилось помилкою' : undefined]
            .filter(Boolean)
            .join(' · '),
        ),
      ))}
    </Box>
  )
}
