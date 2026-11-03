export type DashKind =
  | 'session'
  | 'prompt'
  | 'turn'
  | 'tool'
  | 'skill'
  | 'mcp'
  | 'agent'
  | 'compact'
  | 'search'

export type DashEvent = {
  id: string
  at: number
  kind: DashKind
  label: string
  detail?: string
  ms?: number
  isError?: boolean
  isSub?: boolean
}

export type DashCount = { n: number; errors: number; ms: number; last: number }

export type DashSkillUse = {
  n: number
  last: number
  source: string
  pluginName?: string
  path?: string
}

export type DashAgentRun = {
  id: string
  type: string
  description: string
  at: number
  ms?: number
  status: string
}

export type DashStats = {
  tools: Record<string, DashCount>
  skills: Record<string, DashSkillUse>
  mcp: Record<string, DashCount>
  agents: DashAgentRun[]
  prompts: number
  turns: number
  compactions: number
  turnMs: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  loadedAt: number
  backfilled: number
}

export type DashSnap = {
  at: number
  model: string
  sessionId: string
  cwd: string
  version: string
  repo: string | null
  surfaces: string[]
  startedAt: number
  ctx: { tokens?: number; window: number; percent?: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  costUsd?: number
  categories: { name: string; tokens: number; kind: string }[]
  ctxTotal: number
  ctxMax: number
  autoCompactAt?: number
  skills: { name: string; source: string; pluginName?: string; tokens: number }[]
  skillsTotal: number
  skillsIncluded: number
  mcpTools: { name: string; server: string; tokens: number; isLoaded: boolean }[]
  memoryFiles: { path: string; type: string; tokens: number }[]
  customAgents: { agentType: string; source: string; tokens: number }[]
  tools: { name: string; mcp: boolean; description: string }[]
  commands: { name: string; source: string; plugin?: string; description: string }[]
  hooks: { event: string; count: number }[]
  plugins: { name: string; isEnabled: boolean }[]
  liveAgents: { id: string; type: string; description: string; status: string }[]
  problems: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'session-dash': {
      tab: string
      skillSource: string
      tick: number
      isRefreshing: boolean
      events: Shaped<DashEvent[]>
      stats: Shaped<DashStats>
      snap: Shaped<DashSnap | null>
    }
  }
}
