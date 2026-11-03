import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'session-dash',
  component: 'Pane',
  requestId: 'session-dash',
  props: {
    title: 'Сесія',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const TABS = ['overview', 'skills', 'mcp', 'agents', 'plugins', 'context', 'timeline'] as const

test('every tab draws, on every surface, after a tool call', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'dash' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'mcp__wmux__pane_list' })
  await clock.advance(100)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Сесія/ }))?.text).toContain('Сесія')

    for (const tab of TABS) {
      await ui.press({ key: `tab-${tab}` })
    }
    await ui.press({ key: 'tab-overview' })
    expect((await ui.find({ type: 'Text', text: /Найчастіші інструменти/ }))?.text).toMatch(/Найчастіші інструменти/)
    expect((await ui.find({ type: 'Text', text: /Bash/ }))?.text).toMatch(/Bash/)

    await ui.press({ key: 'tab-mcp' })
    expect((await ui.find({ type: 'Text', text: /^wmux$/ }))?.text).toMatch(/^wmux$/)

    await ui.press({ key: 'tab-timeline' })
    expect((await ui.find({ type: 'Text', text: /Шкала часу/ }))?.text).toMatch(/Шкала часу/)
    await ui.unmount()
  }
})

test('a value an earlier version stored is declined', async ($, on) => {
  mock.clock(on)
  on('state.get', () => ({ value: { value: [{ bogus: true }], version: 1 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Сесія/ }))?.text).toMatch(/Сесія/)
  await ui.unmount()
})
