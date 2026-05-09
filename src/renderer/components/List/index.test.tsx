// @vitest-environment jsdom

import events from '@common/events'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...args: any[]) => unknown

const mocks = vi.hoisted(() => ({
  actions: {
    getContentOfList: vi.fn(),
    setSystemHosts: vi.fn(),
  },
  broadcast: vi.fn(),
  handlers: new Map<string, Handler[]>(),
  hostsList: [
    {
      id: 'local-dev',
      title: 'Development',
      type: 'local',
      on: false,
    },
    {
      id: 'local-api',
      title: 'API Override',
      type: 'local',
      on: true,
    },
  ],
  hostsData: null as any,
  configs: {
    choice_mode: 2,
    multi_chose_folder_switch_all: false,
    write_mode: 'append',
  },
  loadHostsData: vi.fn(),
  setCurrentHosts: vi.fn(),
  setList: vi.fn(),
  showErrorNotification: vi.fn(),
}))

vi.mock('@renderer/components/Tree', async () => {
  const React = await import('react')

  return {
    Tree: ({ data }: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'tree' },
        data.map((item: any) => React.createElement('div', { key: item.id }, item.title)),
      ),
  }
})

vi.mock('@renderer/components/ItemIcon', () => ({
  default: () => null,
}))

vi.mock('./ListItem', () => ({
  default: () => null,
}))

vi.mock('@renderer/core/agent', () => ({
  actions: mocks.actions,
  agent: {
    broadcast: mocks.broadcast,
    platform: 'darwin',
  },
}))

vi.mock('@renderer/core/notify', () => ({
  showErrorNotification: mocks.showErrorNotification,
}))

vi.mock('@renderer/core/useOnBroadcast', () => ({
  default: (channel: string, handler: Handler) => {
    const handlers = mocks.handlers.get(channel) ?? []
    handlers.push(handler)
    mocks.handlers.set(channel, handlers)
  },
}))

vi.mock('@renderer/models/useConfigs', () => ({
  default: () => ({
    configs: mocks.configs,
  }),
}))

vi.mock('@renderer/models/useHostsData', () => ({
  default: () => ({
    hostsData: mocks.hostsData,
    loadHostsData: mocks.loadHostsData,
    setList: mocks.setList,
    currentHosts: null,
    setCurrentHosts: mocks.setCurrentHosts,
  }),
}))

vi.mock('@renderer/models/useI18n', () => ({
  default: () => ({
    lang: {
      fail: 'Fail',
      items: 'items',
      no_access_to_hosts: 'No access to hosts',
      success: 'Success',
      system_hosts: 'System Hosts',
      untitled: 'Untitled',
    },
  }),
}))

import List from './index'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, reject, resolve }
}

describe('List tray synchronization', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    mocks.actions.getContentOfList.mockReset()
    mocks.actions.setSystemHosts.mockReset()
    mocks.broadcast.mockReset()
    mocks.handlers.clear()
    mocks.loadHostsData.mockReset()
    mocks.setCurrentHosts.mockReset()
    mocks.setList.mockReset()
    mocks.showErrorNotification.mockReset()

    mocks.actions.getContentOfList.mockResolvedValue('10.0.0.8 api.local\n')
    mocks.actions.setSystemHosts.mockResolvedValue({ success: true })
    mocks.broadcast.mockResolvedValue(undefined)
    mocks.hostsData = {
      list: mocks.hostsList,
      trashcan: [],
      version: 'test',
    }
    mocks.loadHostsData.mockResolvedValue(undefined)
  })

  it('notifies the tray after the new list state has been persisted', async () => {
    const persistList = deferred()
    mocks.setList.mockReturnValue(persistList.promise)

    render(<List />)

    const toggleHandlers = mocks.handlers.get(events.toggle_item) ?? []
    expect(toggleHandlers.length).toBeGreaterThan(0)
    const toggleHandler = toggleHandlers[toggleHandlers.length - 1]

    await act(async () => {
      toggleHandler('local-dev', true)
    })

    await waitFor(() => expect(mocks.setList).toHaveBeenCalled())
    expect(mocks.broadcast).not.toHaveBeenCalledWith(events.tray_list_updated)

    await act(async () => {
      persistList.resolve()
      await persistList.promise
    })

    await waitFor(() => {
      expect(mocks.broadcast).toHaveBeenCalledWith(events.tray_list_updated)
      expect(mocks.broadcast).toHaveBeenCalledWith(events.set_hosts_on_status, 'local-dev', true)
    })

    const channels = mocks.broadcast.mock.calls.map(([channel]) => channel)
    expect(channels.indexOf(events.tray_list_updated)).toBeLessThan(
      channels.indexOf(events.set_hosts_on_status),
    )
  })
})
