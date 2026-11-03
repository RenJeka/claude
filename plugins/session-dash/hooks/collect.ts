import type { EngineInterface } from 'claude-code'

import type { DashSnap, DashStats } from '../types'
import { clip, mcpServerOf } from './format'

export const emptyStats = (loadedAt: number): DashStats => ({
  tools: {},
  skills: {},
  mcp: {},
  agents: [],
  prompts: 0,
  turns: 0,
  compactions: 0,
  turnMs: 0,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  loadedAt,
  backfilled: 0,
})

const safe = async <T>(problems: string[], what: string, run: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await run()
  } catch (err) {
    problems.push(`${what}: ${err instanceof Error ? err.message : String(err)}`)
    return fallback
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Hooks configured in settings, counted per event. */
const hooksOf = (raw: unknown): { event: string; count: number }[] => {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([event, groups]) => {
      const count = Array.isArray(groups)
        ? groups.reduce<number>(
            (n, g) => n + (isRecord(g) && Array.isArray(g.hooks) ? g.hooks.length : 1),
            0,
          )
        : 0
      return { event, count }
    })
    .filter(h => h.count > 0)
}

/** Everything the dashboard shows that the engine can be asked for now. */
export async function collect($: EngineInterface): Promise<DashSnap> {
  const problems: string[] = []
  const at = await $.clock.now()

  const [model, sessionId, cwd, version, repo, surfaces, usage, tools, commands, agents, hooksRaw, pluginsRaw] =
    await Promise.all([
      safe(problems, 'model', () => $.session.model(), '—'),
      safe(problems, 'id', () => $.session.id(), '—'),
      safe(problems, 'cwd', () => $.session.cwd(), '—'),
      safe(problems, 'version', async () => (await $.session.version()).version, '—'),
      safe(problems, 'repo', async () => {
        const r = await $.session.repo()
        return r === null ? null : (r.name ?? r.root)
      }, null),
      safe(problems, 'surfaces', async () => [...(await $.session.surfaces())] as string[], []),
      safe(problems, 'usage', () => $.session.usage({ breakdown: 'summary' }), undefined),
      safe(problems, 'tools', () => $.tool.list(), []),
      safe(problems, 'commands', () => $.command.list(), []),
      safe(problems, 'agents', () => $.agent.list(), []),
      safe(problems, 'hooks', () => $.settings.read({ key: 'hooks' }), undefined),
      safe(problems, 'plugins', () => $.settings.read({ key: 'enabledPlugins' }), undefined),
    ])

  const b = usage?.context.breakdown

  // Plugins: what settings enable, plus every plugin a command or skill names.
  const plugins = new Map<string, boolean>()
  if (isRecord(pluginsRaw)) {
    for (const [name, on] of Object.entries(pluginsRaw)) plugins.set(name, on === true)
  }
  const knownPlugin = (name: string | undefined) => {
    if (name === undefined) return
    const has = [...plugins.keys()].some(k => k === name || k.startsWith(`${name}@`))
    if (!has) plugins.set(name, true)
  }
  for (const c of commands) knownPlugin(c.plugin)
  for (const s of b?.skills?.skillFrontmatter ?? []) knownPlugin(s.pluginName)

  return {
    at,
    model,
    sessionId,
    cwd,
    version,
    repo,
    surfaces,
    startedAt: usage?.startedAt ?? at,
    ctx: {
      tokens: usage?.context.tokens,
      window: usage?.context.window ?? 0,
      percent: usage?.context.percent,
    },
    rateLimits: (usage?.rateLimits ?? []).map(r => ({
      kind: r.kind,
      percentUsed: r.percentUsed,
      resetsAt: r.resetsAt,
    })),
    costUsd: usage?.cost?.usd,
    categories: (b?.categories ?? []).map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
    ctxTotal: b?.totalTokens ?? 0,
    ctxMax: b?.rawMaxTokens ?? 0,
    autoCompactAt: b?.autoCompactThreshold,
    skills: (b?.skills?.skillFrontmatter ?? []).map(s => ({
      name: s.name,
      source: String(s.source),
      pluginName: s.pluginName,
      tokens: s.tokens,
    })),
    skillsTotal: b?.skills?.totalSkills ?? 0,
    skillsIncluded: b?.skills?.includedSkills ?? 0,
    mcpTools: (b?.mcpTools ?? []).map(t => ({
      name: t.name,
      server: t.serverName,
      tokens: t.tokens,
      isLoaded: t.isLoaded,
    })),
    memoryFiles: (b?.memoryFiles ?? []).map(f => ({ path: f.path, type: f.type, tokens: f.tokens })),
    customAgents: (b?.agents ?? []).map(a => ({ agentType: a.agentType, source: a.source, tokens: a.tokens })),
    tools: tools.map(t => ({ name: t.name, mcp: t.mcp, description: clip(t.description, 160) })),
    commands: commands.map(c => ({
      name: c.name,
      source: c.source,
      plugin: c.plugin,
      description: clip(c.description, 120),
    })),
    hooks: hooksOf(hooksRaw),
    plugins: [...plugins.entries()]
      .map(([name, isEnabled]) => ({ name, isEnabled }))
      .sort((x, y) => Number(y.isEnabled) - Number(x.isEnabled) || x.name.localeCompare(y.name)),
    liveAgents: agents.map(a => ({
      id: a.id,
      type: a.type,
      description: a.description,
      status: a.status,
    })),
    problems,
  }
}

/**
 * Counts what the transcript already holds from before the mod loaded: tool
 * calls, skills and agents. The transcript keeps no times, so nothing of this
 * goes on the timeline.
 */
export async function backfill($: EngineInterface, stats: DashStats): Promise<DashStats> {
  const messages = await $.session.messages()
  const next: DashStats = {
    ...stats,
    tools: { ...stats.tools },
    skills: { ...stats.skills },
    mcp: { ...stats.mcp },
    agents: [...stats.agents],
  }
  let calls = 0
  for (const m of messages) {
    if (m.role === 'user' && m.text.trim() !== '' && (m.toolResults ?? []).length === 0) next.prompts += 1
    for (const use of m.toolUses) {
      calls += 1
      const t = next.tools[use.tool] ?? { n: 0, errors: 0, ms: 0, last: 0 }
      next.tools[use.tool] = { ...t, n: t.n + 1, errors: t.errors + (use.isError ? 1 : 0) }
      const server = mcpServerOf(use.tool)
      if (server !== undefined) {
        const s = next.mcp[server] ?? { n: 0, errors: 0, ms: 0, last: 0 }
        next.mcp[server] = { ...s, n: s.n + 1, errors: s.errors + (use.isError ? 1 : 0) }
      }
      if (use.tool === 'Skill' && typeof use.input.skill === 'string') {
        const name = use.input.skill
        const s = next.skills[name] ?? { n: 0, last: 0, source: '?' }
        next.skills[name] = { ...s, n: s.n + 1 }
      }
      if (use.tool === 'Agent' || use.tool === 'Task') {
        next.agents.push({
          id: use.tool_use_id,
          type: typeof use.input.subagent_type === 'string' ? use.input.subagent_type : 'general-purpose',
          description: typeof use.input.description === 'string' ? use.input.description : '',
          at: 0,
          status: use.isError ? 'failed' : 'completed',
        })
      }
    }
  }
  next.backfilled = calls
  return next
}
