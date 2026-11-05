// @vitest-environment jsdom

import events from '@common/events'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  focus: vi.fn().mockResolvedValue(null),
  broadcast: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@renderer/core/agent', () => ({
  actions: { cmdFocusMainWindow: mocks.focus },
  agent: { platform: 'darwin', broadcast: mocks.broadcast },
}))
vi.mock('@mantine/core', () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
  ActionIcon: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))
vi.mock('@renderer/components/List', () => ({ default: () => null }))
vi.mock('@renderer/components/ItemIcon', () => ({ default: () => null }))
vi.mock('@renderer/core/useOnBroadcast', () => ({ default: () => {} }))
vi.mock('@renderer/models/useConfigs', () => ({
  default: () => ({ configs: null, loadConfigs: vi.fn() }),
}))
vi.mock('@renderer/models/useHostsData', () => ({
  default: () => ({ currentHosts: null, setCurrentHosts: mocks.select, loadHostsData: vi.fn() }),
}))
vi.mock('@renderer/models/useI18n', () => ({
  default: () => ({ lang: { show_main_window: 'Show main window' }, setLocale: vi.fn() }),
}))
vi.mock('@renderer/models/useResolvedTheme', () => ({ default: () => 'light' }))

import ListItem from '@renderer/components/List/ListItem'
import TrayPage from './tray'

describe('tray main-window invocation', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('uses the source-window-aware command from the tray header', () => {
    render(<TrayPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Show main window' }))
    expect(mocks.focus).toHaveBeenCalledOnce()
    expect(mocks.broadcast).not.toHaveBeenCalled()
  })

  it('selects the requested scheme and opens on the tray screen on double click', () => {
    render(
      <ListItem
        data={{ id: 'dev', title: 'Development', type: 'local' }}
        selectedIds={[]}
        isTray
      />,
    )
    fireEvent.doubleClick(screen.getByText('Development'))
    expect(mocks.broadcast).toHaveBeenCalledWith(events.select_hosts, 'dev', 1000)
    expect(mocks.focus).toHaveBeenCalledOnce()
    expect(mocks.broadcast).not.toHaveBeenCalledWith(events.active_main_window)
  })

  it('does not reposition the main window when selecting a normal list item', () => {
    const data = { id: 'dev', title: 'Development', type: 'local' as const }
    render(<ListItem data={data} selectedIds={[]} />)
    fireEvent.click(screen.getByText('Development'))
    fireEvent.doubleClick(screen.getByText('Development'))
    expect(mocks.select).toHaveBeenCalledWith(data)
    expect(mocks.focus).not.toHaveBeenCalled()
  })
})
