import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DashEvent, DashKind, DashStats } from '../types'
import { backfill, collect, emptyStats } from './collect'
import { clip, fmtUsd, mcpServerOf, mcpToolOf } from './format'
import { Agents, Context, Header, Mcp, Overview, Plugins, Skills, Timeline } from './views'
import type { Acts, Data, UI } from './views'

const PANE = 'session-dash'
const MAX_EVENTS = 600

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const tab = atom({ plugin: 'session-dash', key: 'tab' } as const, 'overview')
const skillSource = atom({ plugin: 'session-dash', key: 'skillSource' } as const, 'all')
const tick = atom({ plugin: 'session-dash', key: 'tick' } as const, 0)
const isRefreshing = atom({ plugin: 'session-dash', key: 'isRefreshing' } as const, false)
const events = atom({ plugin: 'session-dash', key: 'events' } as const, [], { shape: 'events-1' })
const stats = atom({ plugin: 'session-dash', key: 'stats' } as const, emptyStats(0), { shape: 'stats-1' })
const snap = atom({ plugin: 'session-dash', key: 'snap' } as const, null, { shape: 'snap-1' })

let seq = 0

const push = async ($: EngineInterface, e: Omit<DashEvent, 'id'>) => {
  seq += 1
  const one: DashEvent = { ...e, id: `${e.at.toString(36)}-${seq}` }
  await update($, events, list => [...list, one].slice(-MAX_EVENTS))
}

const bump = (map: DashStats['tools'], name: string, ms: number, isError: boolean, at: number) => {
  const t = map[name] ?? { n: 0, errors: 0, ms: 0, last: 0 }
  return { ...map, [name]: { n: t.n + 1, errors: t.errors + (isError ? 1 : 0), ms: t.ms + ms, last: at } }
}

const refresh = async ($: EngineInterface) => {
  await update($, isRefreshing, () => true)
  try {
    const s = await collect($)
    await update($, snap, () => s)
  } finally {
    await update($, isRefreshing, () => false)
  }
}

/** Runs `fn` off the hook that asked, so the turn never waits on it. */
const later = ($: EngineInterface, fn: () => Promise<unknown>) => {
  $.clock.after(30, () => {
    void fn().catch(err => $.ui.log(`session-dash: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' }))
  })
}

const kindOf = (tool: string): DashKind =>
  tool.startsWith('mcp__') ? 'mcp' : tool === 'ToolSearch' ? 'search' : tool === 'Agent' || tool === 'Task' ? 'agent' : 'tool'

/** A short line saying what a call was about, from its input. */
const detailOf = (e: Record<string, unknown>): string | undefined => {
  for (const k of ['command', 'file_path', 'pattern', 'query', 'url', 'skill', 'description', 'path', 'prompt']) {
    const v = e[k]
    if (typeof v === 'string' && v.trim() !== '') return `${k}: ${clip(v, 160)}`
  }
  return undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'dash',
      description: 'Відкрити міні-дашборд поточної сесії (скіли, MCP, агенти, контекст, таймлайн)',
    })
    const now = await $.clock.now()
    const st = await read($, stats)
    if (st.loadedAt === 0) {
      // First load in this session: count what happened before the mod came.
      let fresh = emptyStats(now)
      try {
        fresh = await backfill($, fresh)
      } catch {
        // An empty transcript or no session yet: start from zero.
      }
      await update($, stats, () => fresh)
      await push($, { at: now, kind: 'session', label: 'Дашборд підключено', detail: `до цього викликів: ${fresh.backfilled}` })
    }
    $.clock.every(15_000, () => void update($, tick, n => n + 1))
    later($, () => refresh($))
    void $.ui.open({ id: PANE, title: 'Сесія' })
    return result
  })

  on('command.run', { command: 'dash' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Сесія' })
    later($, () => refresh($))
    return { text: 'Дашборд сесії відкрито.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta !== true) {
      const at = await $.clock.now()
      const label = e.command !== undefined ? `/${e.command.name} ${e.command.args}`.trim() : e.text
      await update($, stats, s => ({ ...s, prompts: s.prompts + 1 }))
      await push($, { at, kind: 'prompt', label: clip(label, 90), detail: clip(e.text, 300) })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const t0 = await $.clock.now()
    const ran = await next(e)
    try {
      const t1 = await $.clock.now()
      const ms = t1 - t0
      const isError = ran.deny !== undefined || ran.isError === true
      const args = e as unknown as Record<string, unknown>
      const kind = kindOf(e.tool)
      const server = mcpServerOf(e.tool)
      await update($, stats, s => ({
        ...s,
        tools: bump(s.tools, e.tool, ms, isError, t1),
        mcp: server !== undefined ? bump(s.mcp, server, ms, isError, t1) : s.mcp,
      }))
      await push($, {
        at: t0,
        kind,
        label: server !== undefined ? `${server} › ${mcpToolOf(e.tool)}` : e.tool,
        detail: ran.deny !== undefined ? `відмовлено: ${clip(ran.deny, 160)}` : detailOf(args),
        ms,
        isError,
        isSub: e.agentId !== undefined,
      })
    } catch {
      // Bookkeeping never gets in the way of the call itself.
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    try {
      const at = await $.clock.now()
      await update($, stats, s => {
        const u = s.skills[e.skill] ?? { n: 0, last: 0, source: String(e.source) }
        return {
          ...s,
          skills: {
            ...s.skills,
            [e.skill]: { n: u.n + 1, last: at, source: String(e.source), pluginName: e.pluginName, path: e.path },
          },
        }
      })
      await push($, {
        at,
        kind: 'skill',
        label: e.skill,
        detail: [String(e.source), e.pluginName, e.path].filter(Boolean).join(' · '),
      })
    } catch {
      // As above.
    }
    return result
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    try {
      if (result.deny === undefined && result.agentId !== undefined) {
        const at = await $.clock.now()
        const id = result.agentId
        await update($, stats, s => ({
          ...s,
          agents: [
            ...s.agents.filter(a => a.id !== id),
            { id, type: e.subagentType || 'general-purpose', description: e.description, at, status: 'running' },
          ].slice(-200),
        }))
      }
    } catch {
      // As above.
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      const now = await $.clock.now()
      if (e.agentId !== undefined) {
        const id = e.agentId
        const run = (await read($, stats)).agents.find(a => a.id === id)
        await update($, stats, s => ({
          ...s,
          agents: s.agents.map(a =>
            a.id === id ? { ...a, ms: e.durationMs, status: e.isAborted ? 'killed' : 'completed' } : a,
          ),
        }))
        await push($, {
          at: now - e.durationMs,
          kind: 'agent',
          label: run ? `${run.type}: ${run.description}` : `агент ${id.slice(0, 8)}`,
          detail: clip(e.answer, 240),
          ms: e.durationMs,
          isError: e.isAborted,
        })
      } else {
        const u = e.usage
        await update($, stats, s => ({
          ...s,
          turns: s.turns + 1,
          turnMs: s.turnMs + e.durationMs,
          tokens: u
            ? {
                input: s.tokens.input + u.input_tokens,
                output: s.tokens.output + u.output_tokens,
                cacheRead: s.tokens.cacheRead + u.cache_read_input_tokens,
                cacheWrite: s.tokens.cacheWrite + u.cache_creation_input_tokens,
              }
            : s.tokens,
        }))
        await push($, {
          at: now - e.durationMs,
          kind: 'turn',
          label: clip(e.answer || (e.isAborted ? 'перервано' : 'хід'), 90),
          detail: u ? `вихід ${u.output_tokens} · вхід ${u.input_tokens} · кеш ${u.cache_read_input_tokens} · ${u.model}` : undefined,
          ms: e.durationMs,
          isError: e.isAborted,
        })
        later($, () => refresh($))
      }
    } catch {
      // As above.
    }
    return result
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    try {
      const at = await $.clock.now()
      await update($, stats, s => ({ ...s, compactions: s.compactions + 1 }))
      await push($, { at, kind: 'compact', label: `Стиснення (${e.trigger})`, detail: e.instructions })
      later($, () => refresh($))
    } catch {
      // As above.
    }
    return result
  }).catch(($, e, next) => next(e))

  // One row above the prompt: a button that opens or closes the pane, and the
  // session in a few numbers.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const [st, s] = await Promise.all([read($, stats), read($, snap)])
    const calls = Object.values(st.tools).reduce((n, t) => n + t.n, 0)
    const parts = [
      s?.ctx.percent !== undefined ? `контекст ${Math.round(s.ctx.percent)}%` : undefined,
      s?.costUsd !== undefined ? fmtUsd(s.costUsd) : undefined,
      `інструментів ${calls}`,
      `скілів ${Object.keys(st.skills).length}`,
      `MCP ${Object.keys(st.mcp).length}`,
    ].filter(Boolean)
    return (
      <Box flexDirection="row" gap={1}>
        <Button
          key="dash-toggle"
          label="📊 Сесія"
          onPress={async () => {
            const isShown = (await $.ui.panes()).some(p => p.id === PANE && p.isShown)
            if (isShown) {
              await $.ui.close({ id: PANE })
            } else {
              await $.ui.open({ id: PANE, title: 'Сесія' })
              later($, () => refresh($))
            }
          }}
        />
        <Text dimColor>{parts.join(' · ')}</Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const ui: UI = {
      Box: table.Box,
      Text: table.Text,
      Button: table.Button,
      Svg: 'Svg' in table ? table.Svg : undefined,
    }
    await read($, tick)
    const [current, source, busy, list, st, s, now] = await Promise.all([
      read($, tab),
      read($, skillSource),
      read($, isRefreshing),
      read($, events),
      read($, stats),
      read($, snap),
      $.clock.now(),
    ])
    const d: Data = { snap: s, stats: st, events: list, now, cols: e.props.bodyColumns, skillSource: source }
    const acts: Acts = {
      setTab: id => void update($, tab, () => id),
      setSkillSource: src => void update($, skillSource, () => src),
      refresh: () => void refresh($),
    }
    const { Box, Text } = ui
    // A tab that throws leaves the header, so the person can switch away.
    let body
    try {
      body =
        current === 'skills'
          ? Skills(ui, d, acts)
          : current === 'mcp'
            ? Mcp(ui, d)
            : current === 'agents'
              ? Agents(ui, d)
              : current === 'plugins'
                ? Plugins(ui, d)
                : current === 'context'
                  ? Context(ui, d)
                  : current === 'timeline'
                    ? Timeline(ui, d)
                    : Overview(ui, d)
    } catch (err) {
      body = (
        <Text color="error">
          Вкладку не вдалося намалювати: {err instanceof Error ? err.message : String(err)}
        </Text>
      )
    }
    return (
      <Box flexDirection="column" paddingX={1}>
        {Header(ui, d, current, busy, acts)}
        {body}
      </Box>
    )
  })
}
