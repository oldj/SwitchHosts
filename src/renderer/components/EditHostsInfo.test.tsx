// @vitest-environment jsdom

import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...args: any[]) => unknown

const mocks = vi.hoisted(() => ({
  actions: {
    refreshHosts: vi.fn().mockResolvedValue({ success: true, data: {} }),
  },
  broadcast: vi.fn(),
  handlers: new Map<string, Handler[]>(),
  hostsData: { list: [] as any[] },
  setList: vi.fn().mockResolvedValue(undefined),
  setCurrentHosts: vi.fn(),
  configs: { dns_provider: 'alidns' },
}))

vi.mock('@renderer/core/agent', () => ({
  actions: mocks.actions,
  agent: { broadcast: mocks.broadcast, platform: 'win32' },
}))

vi.mock('@renderer/core/useOnBroadcast', () => ({
  default: (channel: string, handler: Handler) => {
    const handlers = mocks.handlers.get(channel) ?? []
    handlers.push(handler)
    mocks.handlers.set(channel, handlers)
  },
}))

vi.mock('@renderer/models/useHostsData', () => ({
  default: () => ({
    hostsData: mocks.hostsData,
    setList: mocks.setList,
    currentHosts: null,
    setCurrentHosts: mocks.setCurrentHosts,
  }),
}))

vi.mock('@renderer/models/useConfigs', () => ({
  default: () => ({ configs: mocks.configs }),
}))

vi.mock('@renderer/models/useI18n', () => ({
  default: () => ({
    lang: {
      btn_ok: 'OK',
      btn_cancel: 'Cancel',
      domain_placeholder: 'e.g. github.com',
      fail: 'Fail',
      hosts_add: 'Add',
      hosts_edit: 'Edit',
      hosts_title: 'Title',
      hosts_type: 'Type',
      invalid_domain: '"{0}" is not a valid domain name.',
      local: 'Local',
      remote: 'Remote',
      group: 'Group',
      folder: 'Folder',
      source_type: 'Source',
      source_url: 'Subscription URL',
      source_domain: 'Domain',
      unknown_error: 'unknown error',
      untitled: 'Untitled',
      url_placeholder: 'http:// or https:// or file://',
    },
    i18n: {
      trans: (key: string, words?: string[]) => {
        const dict: Record<string, string> = {
          domain_hint:
            'Will be resolved to an IP via {0} and written as hosts. The DNS service can be changed in Preferences.',
          invalid_domain: '"{0}" is not a valid domain name.',
        }
        return (words || []).reduce(
          (acc, w, i) => acc.replace(`{${i}}`, String(w)),
          dict[key] ?? key,
        )
      },
    },
    locale: 'en',
  }),
}))

vi.mock('@renderer/components/SideDrawer', () => ({
  // 渲染 children + footer，绕开 Mantine Drawer 的传送门细节
  default: ({ children, footer }: any) => React.createElement('div', null, children, footer),
}))

vi.mock('@renderer/components/ItemIcon', () => ({ default: () => null }))

import EditHostsInfo from './EditHostsInfo'

// jsdom lacks matchMedia; Mantine components expect it
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// jsdom lacks ResizeObserver; Mantine components expect it
if (!(window as any).ResizeObserver) {
  ;(window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function openDialog(payload?: any) {
  render(
    <MantineProvider>
      <EditHostsInfo />
    </MantineProvider>,
  )
  const key = payload ? 'edit_hosts_info' : 'add_new'
  const handlers = mocks.handlers.get(key) ?? []
  act(() => {
    handlers.forEach((h) => h(payload))
  })
}

beforeEach(() => {
  mocks.setList.mockReset().mockImplementation(async (update) => {
    update(structuredClone(mocks.hostsData.list))
  })
  mocks.actions.refreshHosts.mockClear()
  mocks.broadcast.mockClear()
})

afterEach(cleanup)

describe('EditHostsInfo domain source', () => {
  it('shows the DoH hint when editing a domain-sourced remote item', async () => {
    openDialog({ id: 'd1', type: 'remote', source: 'domain', title: 'GH', url: 'github.com' })
    expect(await screen.findByText(/Ali DoH/i)).toBeTruthy()
    expect(screen.getByText(/Will be resolved/i)).toBeTruthy()
  })

  it('blocks save for an invalid domain and shows the inline error', async () => {
    openDialog({ id: 'd1', type: 'remote', source: 'domain', title: 'GH', url: 'bad domain!' })
    await screen.findByText(/Will be resolved/i)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => {
      expect(screen.getByText(/not a valid domain/i)).toBeTruthy()
    })
    expect(mocks.setList).not.toHaveBeenCalled()
  })

  it('saves a valid domain item and keeps source=domain', async () => {
    mocks.hostsData.list = [
      { id: 'd1', type: 'remote', source: 'domain', title: 'GH', url: 'github.com' },
    ]
    openDialog(mocks.hostsData.list[0])
    await screen.findByText(/Will be resolved/i)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => {
      expect(mocks.setList).toHaveBeenCalled()
    })
    const saved = mocks.setList.mock.calls[0][0](structuredClone(mocks.hostsData.list)) as any[]
    expect(saved[0].source).toBe('domain')
    expect(saved[0].url).toBe('github.com')
  })

  it('shows no hint for url-sourced items', async () => {
    openDialog({ id: 'u1', type: 'remote', title: 'Sub', url: 'https://example.com/hosts' })
    await screen.findByDisplayValue('https://example.com/hosts')
    expect(screen.queryByText(/Will be resolved/i)).toBeNull()
  })

  it('normalizes a pasted URL to its bare domain on save', async () => {
    mocks.hostsData.list = [
      { id: 'd2', type: 'remote', source: 'domain', title: 'DBLP', url: 'https://dblp.org/' },
    ]
    openDialog(mocks.hostsData.list[0])
    await screen.findByDisplayValue('https://dblp.org/')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => {
      expect(mocks.setList).toHaveBeenCalled()
    })
    const saved = mocks.setList.mock.calls[0][0](structuredClone(mocks.hostsData.list)) as any[]
    expect(saved[0].url).toBe('dblp.org')
  })

  it('does not refresh when a domain item is saved unchanged', async () => {
    mocks.hostsData.list = [
      { id: 'd1', type: 'remote', source: 'domain', title: 'GH', url: 'github.com' },
    ]
    openDialog(mocks.hostsData.list[0])
    await screen.findByText(/Will be resolved/i)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => {
      expect(mocks.setList).toHaveBeenCalled()
    })
    expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
  })

  it('refreshes when an existing item is retargeted to a domain', async () => {
    mocks.hostsData.list = [
      { id: 'u1', type: 'remote', title: 'Sub', url: 'https://example.com/hosts' },
    ]
    openDialog(mocks.hostsData.list[0])
    await screen.findByDisplayValue('https://example.com/hosts')
    fireEvent.click(screen.getByRole('radio', { name: 'Domain' }))
    await screen.findByText(/Will be resolved/i)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => {
      expect(mocks.setList).toHaveBeenCalled()
    })
    const saved = mocks.setList.mock.calls[0][0](structuredClone(mocks.hostsData.list)) as any[]
    expect(saved[0].source).toBe('domain')
    expect(saved[0].url).toBe('example.com')
    expect(mocks.actions.refreshHosts).toHaveBeenCalledWith('u1')
  })
})

it('does not mutate the current list or refresh/select an item after a failed edit', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.hostsData.list = [
    { id: 'd1', type: 'remote', source: 'domain', title: 'GH', url: 'github.com' },
  ]
  mocks.setList.mockRejectedValue(new Error('disk full'))
  openDialog(mocks.hostsData.list[0])
  fireEvent.change(await screen.findByDisplayValue('github.com'), {
    target: { value: 'example.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(spy).toHaveBeenCalled())
  expect(mocks.hostsData.list[0].url).toBe('github.com')
  expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
  expect(mocks.broadcast).not.toHaveBeenCalled()
  spy.mockRestore()
})

it('preserves switch and refresh metadata when editing a node read before a concurrent update', async () => {
  mocks.hostsData.list = [
    {
      id: 'd1',
      type: 'remote',
      title: 'Before',
      url: 'https://example.com',
      on: false,
      last_refresh_ms: 10,
    },
  ]
  openDialog(mocks.hostsData.list[0])
  fireEvent.change(await screen.findByDisplayValue('Before'), { target: { value: 'After' } })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(mocks.setList).toHaveBeenCalled())
  const latest = [{ ...mocks.hostsData.list[0], on: true, last_refresh_ms: 20 }]
  const saved = mocks.setList.mock.calls[0][0](latest)
  expect(saved[0]).toMatchObject({ title: 'After', on: true, last_refresh_ms: 20 })
})

it('does not recreate a node deleted while its edit form was open', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.hostsData.list = [{ id: 'deleted', type: 'local', title: 'Deleted' }]
  openDialog(mocks.hostsData.list[0])
  mocks.hostsData.list = []
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(spy).toHaveBeenCalled())
  expect(mocks.broadcast).not.toHaveBeenCalled()
  expect(mocks.hostsData.list).toEqual([])
  spy.mockRestore()
})
