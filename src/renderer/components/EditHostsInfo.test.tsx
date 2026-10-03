// @vitest-environment jsdom

import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...args: any[]) => unknown

const mocks = vi.hoisted(() => ({
  actions: {
    refreshHosts: vi.fn().mockResolvedValue({ success: true, data: {} }),
  },
  broadcast: vi.fn(),
  handlers: new Map<string, Handler>(),
  hostsData: { list: [] as any[] },
  currentHosts: null as any,
  setList: vi.fn().mockResolvedValue(undefined),
  setCurrentHosts: vi.fn(),
  configs: { dns_provider: 'alidns' },
  showSuccessNotification: vi.fn(),
  showErrorNotification: vi.fn(),
}))

vi.mock('@renderer/core/agent', () => ({
  actions: mocks.actions,
  agent: { broadcast: mocks.broadcast, platform: 'win32' },
}))

vi.mock('@renderer/core/useOnBroadcast', () => ({
  default: (channel: string, handler: Handler) => {
    mocks.handlers.set(channel, handler)
  },
}))

vi.mock('@renderer/core/notify', () => ({
  getErrorMessage: (error: Error, fallback: string) => error.message || fallback,
  showErrorNotification: mocks.showErrorNotification,
  showSuccessNotification: mocks.showSuccessNotification,
}))

vi.mock('@renderer/models/useHostsData', () => ({
  default: () => ({
    hostsData: mocks.hostsData,
    setList: mocks.setList,
    currentHosts: mocks.currentHosts,
    setCurrentHosts: mocks.setCurrentHosts,
  }),
}))

vi.mock('@renderer/models/useConfigs', () => ({
  default: () => ({ configs: mocks.configs }),
}))

vi.mock('@renderer/models/useI18n', async () => {
  const { I18N } = await import('@common/i18n')
  const i18n = new I18N('en')
  return { default: () => ({ lang: i18n.lang, i18n, locale: 'en' }) }
})

vi.mock('@renderer/components/SideDrawer', () => ({
  // 渲染 children + footer，绕开 Mantine Drawer 的传送门细节
  default: ({ opened, children, footer }: any) =>
    opened ? React.createElement('div', { role: 'dialog' }, children, footer) : null,
}))

vi.mock('@renderer/components/ItemIcon', () => ({ default: () => null }))

import EditHostsInfo from './EditHostsInfo'
import DomainResolutionResults from './DomainResolutionResults'

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
  act(() => {
    mocks.handlers.get(key)?.(payload)
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  mocks.setList.mockReset().mockImplementation(async (update) => {
    update(structuredClone(mocks.hostsData.list))
  })
  mocks.hostsData.list = []
  mocks.currentHosts = null
  mocks.setCurrentHosts.mockReset().mockImplementation((update) => {
    mocks.currentHosts = typeof update === 'function' ? update(mocks.currentHosts) : update
  })
  mocks.handlers.clear()
  mocks.actions.refreshHosts.mockReset().mockResolvedValue({ success: true, data: {} })
  mocks.broadcast.mockClear()
  mocks.showErrorNotification.mockClear()
  mocks.showSuccessNotification.mockClear()
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
    expect(saved[0].domains).toEqual(['github.com'])
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

  it('invalidates previous-source caches when switching a subscription to DNS', async () => {
    mocks.hostsData.list = [
      {
        id: 'u1',
        type: 'remote',
        url: 'https://example.com/hosts',
        domain_results: [{ domain: 'example.com', status: 'resolved', ips: ['1.2.3.4'] }],
        domain_refresh_status: 'complete',
        last_attempt: 'Yesterday',
        last_attempt_ms: 42,
      },
    ]
    openDialog(mocks.hostsData.list[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://github.com' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Domain' }))
    expect(
      (screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement).value,
    ).toBe('https://github.com')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(mocks.setList).toHaveBeenCalled())
    const saved = mocks.setList.mock.calls[0][0](structuredClone(mocks.hostsData.list)) as any[]
    expect(saved[0].domains).toEqual(['github.com'])
    expect(saved[0].domain_results).toEqual([])
    expect(saved[0].domain_refresh_status).toBeUndefined()
    expect(saved[0].last_attempt).toBeUndefined()
    expect(saved[0].last_attempt_ms).toBeUndefined()
  })

  it('clears DNS metadata when switching back to a subscription', async () => {
    mocks.hostsData.list = [
      {
        id: 'd1',
        type: 'remote',
        source: 'domain',
        domains: ['example.com'],
        url: 'example.com',
        domain_results: [{ domain: 'example.com', status: 'resolved', ips: ['1.2.3.4'] }],
        domain_refresh_status: 'complete',
        last_attempt: 'Yesterday',
        last_attempt_ms: 42,
      },
    ]
    openDialog(mocks.hostsData.list[0])
    fireEvent.click(screen.getByRole('radio', { name: 'Subscription URL' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://example.org/hosts' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(mocks.setList).toHaveBeenCalled())
    const saved = mocks.setList.mock.calls[0][0](structuredClone(mocks.hostsData.list)) as any[]
    expect(saved[0].source).toBe('url')
    expect(saved[0].domains).toBeUndefined()
    expect(saved[0].domain_results).toEqual([])
    expect(saved[0].domain_refresh_status).toBeUndefined()
    expect(saved[0].last_attempt).toBeUndefined()
    expect(saved[0].last_attempt_ms).toBeUndefined()
    expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
  })

  it('starts a subscription conversion from its current URL even when legacy DNS fields remain', () => {
    openDialog({
      id: 'u1',
      type: 'remote',
      source: 'url',
      url: 'https://new.example/hosts',
      domains: ['old.example'],
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Domain' }))
    expect(
      (screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement).value,
    ).toBe('https://new.example/hosts')
  })

  it('does not show DNS results when a subscription is switched to an unsaved domain draft', () => {
    openDialog({ id: 'u1', type: 'remote', url: 'https://example.com/hosts' })
    fireEvent.click(screen.getByRole('radio', { name: 'Domain' }))
    expect(
      (screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement).value,
    ).toBe('https://example.com/hosts')
    expect(screen.queryByText('Resolution results')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Save to resolve' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
  })

  it('keeps legacy saved DNS results after editing both source drafts without saving', () => {
    openDialog({
      id: 'd1',
      type: 'remote',
      source: 'domain',
      url: 'old.example',
      domain_results: [{ domain: 'old.example', status: 'resolved', ips: ['192.0.2.1'] }],
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Domain list' }), {
      target: { value: 'draft.example' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Subscription URL' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'URL' }), {
      target: { value: 'https://subscription.example/hosts' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Domain' }))
    expect(
      (screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement).value,
    ).toBe('draft.example')
    const results = within(screen.getByText('Resolution results').closest('details')!)
    expect(results.getByText('old.example')).toBeTruthy()
    expect(results.getByText('192.0.2.1')).toBeTruthy()
    expect(results.queryByText('draft.example')).toBeNull()
    expect(results.queryByText('https://subscription.example/hosts')).toBeNull()
    expect(results.queryByText('Pending resolution')).toBeNull()
  })

  it('preserves an intentionally empty domain draft when switching sources without saving', () => {
    openDialog({
      id: 'd1',
      type: 'remote',
      source: 'domain',
      url: 'old.example',
      domains: ['old.example'],
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Domain list' }), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Subscription URL' }))
    const refresh = screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement
    expect(refresh.disabled).toBe(true)
    fireEvent.click(refresh)
    expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Domain' }))
    expect(
      (screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement).value,
    ).toBe('')
  })

  it('normalizes and deduplicates multiple domains in order, preserving the draft until save', async () => {
    mocks.hostsData.list = [{ id: 'd1', type: 'remote', source: 'domain', url: 'github.com' }]
    openDialog(mocks.hostsData.list[0])
    const input = screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement
    const draft = 'https://GitHub.com/path\n\napi.github.com\nGITHUB.COM\nexample.org'
    fireEvent.change(input, { target: { value: draft } })
    expect(input.value).toBe(draft)
    expect(screen.getByText('3 / 100 domains')).toBeTruthy()
    expect(screen.getByText(/1 duplicates merged/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(mocks.setList).toHaveBeenCalled())
    const saved = mocks.setList.mock.calls[0][0](structuredClone(mocks.hostsData.list)) as any[]
    expect(saved[0].domains).toEqual(['github.com', 'api.github.com', 'example.org'])
    expect(mocks.actions.refreshHosts).toHaveBeenCalledWith('d1')
    expect(mocks.showSuccessNotification).toHaveBeenCalledWith({
      title: 'Domain configuration saved',
      message: 'Saved 3 domains. Resolving… · 1 duplicates merged',
    })
  })

  it('reports original line numbers for invalid input without discarding any lines', async () => {
    openDialog({ id: 'd1', type: 'remote', source: 'domain', domains: ['github.com'] })
    const input = screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement
    const draft = 'github.com\n\nbad domain!\napi.github.com\nhttps://'
    fireEvent.change(input, { target: { value: draft } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('Line 3 is not a valid domain: bad domain!')).toBeTruthy()
    expect(screen.getByText('Line 5 is not a valid domain: https://')).toBeTruthy()
    expect(input.value).toBe(draft)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(mocks.setList).not.toHaveBeenCalled()
  })

  it.each([
    { mode: 'edit', trigger: 'button' },
    { mode: 'add', trigger: 'shortcut' },
  ])(
    'blocks a 101-domain $mode through the $trigger without truncating its draft',
    async ({ mode, trigger }) => {
      const item = { id: 'd1', type: 'remote', source: 'domain', domains: ['saved.example'] }
      mocks.hostsData.list = [item]
      if (mode === 'edit') {
        openDialog(item)
      } else {
        openDialog()
        fireEvent.click(screen.getByRole('radio', { name: 'Remote' }))
        fireEvent.click(screen.getByRole('radio', { name: 'Domain' }))
      }
      const input = screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement
      const draft = Array.from({ length: 101 }, (_, index) => `d${index}.example`).join('\n')
      fireEvent.change(input, { target: { value: draft } })
      expect(screen.getByText('101 / 100 domains')).toBeTruthy()
      expect(screen.getByRole('alert')).toBeTruthy()
      if (trigger === 'button') fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      else fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
      expect(mocks.setList).not.toHaveBeenCalled()
      expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      expect(
        screen.getByText(
          'At most 100 unique domains are allowed. Remove some domains before saving.',
        ),
      ).toBeTruthy()
      expect(input.value).toBe(draft)
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(screen.getByRole('dialog')).toBeTruthy()
    },
  )

  it('saves 100 unique domains even when duplicate URLs and blank lines exceed 100 input lines', async () => {
    const item = { id: 'd1', type: 'remote', source: 'domain', domains: ['saved.example'] }
    mocks.hostsData.list = [item]
    openDialog(item)
    const domains = Array.from({ length: 100 }, (_, index) => `d${index}.example`)
    const draft = [...domains, '', 'https://D0.EXAMPLE/path', 'D99.EXAMPLE'].join('\n')
    const input = screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: draft } })
    expect(input.value).toBe(draft)
    expect(screen.getByText('100 / 100 domains')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(mocks.setList).toHaveBeenCalledTimes(1))
    const saved = mocks.setList.mock.calls[0][0](structuredClone(mocks.hostsData.list)) as any[]
    expect(saved[0].domains).toEqual(domains)
    expect(mocks.actions.refreshHosts).toHaveBeenCalledWith('d1')
  })

  it('keeps an oversized imported list from refreshing until its 100-domain repair is saved', async () => {
    const domains = Array.from({ length: 101 }, (_, index) => `d${index}.example`)
    const item = { id: 'd1', type: 'remote', source: 'domain', domains }
    mocks.hostsData.list = [item]
    openDialog(item)
    const refresh = screen.getByRole('button', { name: 'Save to resolve' }) as HTMLButtonElement
    expect(refresh.disabled).toBe(true)
    fireEvent.click(refresh)
    expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
    const input = screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement
    expect(input.value).toBe(domains.join('\n'))
    fireEvent.change(input, { target: { value: domains.slice(0, 100).join('\n') } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Save to resolve' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(mocks.actions.refreshHosts).toHaveBeenCalledWith('d1'))
    const saved = mocks.setList.mock.calls[0][0](structuredClone(mocks.hostsData.list)) as any[]
    expect(saved[0].domains).toEqual(domains.slice(0, 100))
  })

  it('blocks an empty list and does not resurrect a legacy url for an explicitly empty list', async () => {
    openDialog({ id: 'd1', type: 'remote', source: 'domain', domains: [], url: 'github.com' })
    const input = screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement
    expect(input.value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await screen.findByText('Enter at least one domain.')
    expect(mocks.setList).not.toHaveBeenCalled()
  })

  it('leaves Enter for newlines and ignores composition, while Ctrl+Enter saves', async () => {
    mocks.hostsData.list = [{ id: 'd1', type: 'remote', source: 'domain', domains: ['github.com'] }]
    openDialog(mocks.hostsData.list[0])
    const input = screen.getByRole('textbox', { name: 'Domain list' })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true, keyCode: 229 })
    expect(mocks.setList).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(mocks.setList).toHaveBeenCalledTimes(1))
  })

  it('disables refresh for an unsaved list and enables it when the edit is reverted', async () => {
    openDialog({ id: 'd1', type: 'remote', source: 'domain', domains: ['github.com'] })
    const input = screen.getByRole('textbox', { name: 'Domain list' })
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    fireEvent.change(input, { target: { value: 'github.com\napi.github.com' } })
    const pending = screen.getByRole('button', { name: 'Save to resolve' }) as HTMLButtonElement
    expect(pending.disabled).toBe(true)
    fireEvent.click(pending)
    expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'github.com' } })
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('shows partial refresh metadata even when the operation returns success=false', async () => {
    const item = {
      id: 'd1',
      type: 'remote',
      source: 'domain',
      domains: ['github.com', 'example.org'],
    }
    mocks.actions.refreshHosts.mockResolvedValue({
      success: false,
      code: 'domain_partial',
      data: {
        ...item,
        domain_refresh_status: 'partial',
        last_attempt: '2026-10-02 19:30:00',
        domain_results: [
          { domain: 'github.com', status: 'resolved', ips: ['1.2.3.4'] },
          {
            domain: 'example.org',
            status: 'stale',
            ips: ['5.6.7.8'],
            error: 'timeout',
            last_success: '2026-10-01 20:00:00',
          },
        ],
      },
    })
    openDialog(item)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('1 updated · 1 using previous IPs · 0 unresolved')
    expect(screen.getByText(/2026-10-02 19:30:00/)).toBeTruthy()
    expect(screen.getByText('Last success: 2026-10-01 20:00:00')).toBeTruthy()
    expect(screen.getByText('timeout')).toBeTruthy()
    expect(mocks.showSuccessNotification).not.toHaveBeenCalled()
    expect(mocks.showErrorNotification).toHaveBeenCalledWith({
      title: 'Resolution results',
      message: 'Some domains could not be resolved. Check the resolution results.',
    })
  })

  it('preserves unsaved input when a background refresh reports new metadata', async () => {
    const item = { id: 'd1', type: 'remote', source: 'domain', domains: ['github.com'] }
    openDialog(item)
    const input = screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'github.com\napi.github.com' } })
    act(() => {
      mocks.handlers.get('hosts_refreshed')?.({
        ...item,
        last_attempt: '2026-10-02 20:00:00',
        domain_results: [{ domain: 'github.com', status: 'resolved', ips: ['1.2.3.4'] }],
      })
    })
    expect(input.value).toBe('github.com\napi.github.com')
    expect(screen.getByText(/2026-10-02 20:00:00/)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Save to resolve' }) as HTMLButtonElement).disabled,
    ).toBe(true)
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

it('preserves domain refresh metadata written while editing', async () => {
  const item = {
    id: 'd1',
    type: 'remote',
    source: 'domain',
    title: 'Before',
    domains: ['github.com'],
  }
  mocks.hostsData.list = [item]
  openDialog(item)
  fireEvent.change(screen.getByRole('textbox', { name: 'Domain list' }), {
    target: { value: 'github.com\nexample.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(mocks.setList).toHaveBeenCalled())
  const metadata = {
    domain_results: [{ domain: 'github.com', status: 'resolved', ips: ['1.2.3.4'] }],
    domain_refresh_status: 'complete',
    last_attempt_ms: 42,
  }
  const saved = mocks.setList.mock.calls[0][0]([{ ...item, ...metadata }])
  expect(saved[0]).toMatchObject({ ...metadata, domains: ['github.com', 'example.com'] })
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

it('keeps a newly opened editor and current selection when a previous edit finishes saving', async () => {
  const pending = deferred()
  const first = {
    id: 'd1',
    type: 'remote',
    source: 'domain',
    domains: ['first.example'],
    title: 'First',
  }
  const second = {
    id: 'd2',
    type: 'remote',
    source: 'domain',
    domains: ['second.example'],
    title: 'Second',
  }
  mocks.hostsData.list = [first, second]
  mocks.currentHosts = first
  mocks.setList.mockImplementationOnce(async (update) => {
    update(structuredClone(mocks.hostsData.list))
    await pending.promise
  })
  openDialog(first)
  fireEvent.change(screen.getByRole('textbox', { name: 'Hosts Title' }), {
    target: { value: 'Saved first' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(mocks.setList).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  act(() => {
    mocks.currentHosts = second
    mocks.handlers.get('edit_hosts_info')?.(second)
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Hosts Title' }), {
    target: { value: 'Unsaved second' },
  })
  await act(async () => pending.resolve())
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'Hosts Title' }) as HTMLInputElement).value).toBe(
    'Unsaved second',
  )
  expect(mocks.currentHosts.id).toBe('d2')
})

it('lets a new editor save while an earlier add is pending without selecting or closing for the old add', async () => {
  const firstPending = deferred()
  const secondPending = deferred()
  mocks.setList
    .mockImplementationOnce(async (update) => {
      update([])
      await firstPending.promise
    })
    .mockImplementationOnce(async (update) => {
      update([])
      await secondPending.promise
    })
  openDialog()
  fireEvent.change(screen.getByRole('textbox', { name: 'Hosts Title' }), {
    target: { value: 'First' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  act(() => mocks.handlers.get('add_new')?.())
  fireEvent.change(screen.getByRole('textbox', { name: 'Hosts Title' }), {
    target: { value: 'Second' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(mocks.setList).toHaveBeenCalledTimes(2))
  await act(async () => firstPending.resolve())
  expect(mocks.broadcast).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Hosts Title' }), { key: 'Enter' })
  expect(mocks.setList).toHaveBeenCalledTimes(2)
  await act(async () => secondPending.resolve())
  expect(mocks.broadcast).toHaveBeenCalledTimes(1)
  expect(mocks.broadcast).toHaveBeenCalledWith('select_hosts', expect.any(String), 1000)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('ignores an old response after reopening the same id with a new saved target and draft', async () => {
  const older = { id: 'd1', type: 'remote', source: 'domain', domains: ['old.example'] }
  const newer = { ...older, domains: ['new.example'], domain_results: [] }
  let finish!: (value: any) => void
  mocks.actions.refreshHosts.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  openDialog(older)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  act(() => mocks.handlers.get('edit_hosts_info')?.(newer))
  fireEvent.change(screen.getByRole('textbox', { name: 'Domain list' }), {
    target: { value: 'new.example\nunsaved.example' },
  })
  await act(async () =>
    finish({
      success: true,
      data: {
        ...older,
        last_attempt: 'OLD-TARGET-TIME',
        last_attempt_ms: 100,
        domain_results: [{ domain: 'old.example', status: 'resolved', ips: ['1.1.1.1'] }],
      },
    }),
  )
  expect((screen.getByRole('textbox', { name: 'Domain list' }) as HTMLTextAreaElement).value).toBe(
    'new.example\nunsaved.example',
  )
  expect(screen.queryByText('old.example')).toBeNull()
  expect(screen.queryByText(/OLD-TARGET-TIME/)).toBeNull()
})

it('renders safe fallbacks for malformed imported refresh timestamps', () => {
  openDialog({
    id: 'd1',
    type: 'remote',
    source: 'domain',
    domains: ['old.example'],
    last_attempt: {},
    last_refresh: [],
  })
  expect(screen.getByText(/N\/A/)).toBeTruthy()
})

it.each([
  { domains: ['github.com', 'bad domain'] },
  { domains: ['https://github.com/path'] },
  { domains: ['github.com', 42] },
  { url: 'https://github.com/path' },
])(
  'refreshes repaired imported domain configurations without refreshing the unsaved invalid target: %j',
  async (fields) => {
    const item = { id: 'd1', type: 'remote', source: 'domain', ...fields }
    mocks.hostsData.list = [item]
    openDialog(item)
    fireEvent.change(screen.getByRole('textbox', { name: 'Domain list' }), {
      target: { value: 'github.com' },
    })
    expect(
      (screen.getByRole('button', { name: 'Save to resolve' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(mocks.actions.refreshHosts).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(mocks.actions.refreshHosts).toHaveBeenCalledWith('d1'))
  },
)

it('repairs a domain item with a non-string legacy URL on save', async () => {
  const item = { id: 'd1', type: 'remote', source: 'domain', domains: ['github.com'], url: 42 }
  mocks.hostsData.list = [item]
  openDialog(item)
  fireEvent.change(screen.getByRole('textbox', { name: 'Domain list' }), {
    target: { value: 'github.com\napi.github.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(mocks.actions.refreshHosts).toHaveBeenCalledWith('d1'))
  const saved = mocks.setList.mock.calls[0][0](structuredClone([item]))
  expect(saved[0].url).toBe('github.com')
  expect(saved[0].domains).toEqual(['github.com', 'api.github.com'])
})

it('keeps newer refresh metadata when a pending save finishes', async () => {
  const pending = deferred()
  const item = {
    id: 'd1',
    type: 'remote',
    source: 'domain',
    domains: ['github.com'],
    title: 'Before',
    last_attempt_ms: 100,
    last_attempt: 'Old',
  }
  mocks.hostsData.list = [item]
  mocks.currentHosts = item
  mocks.setList.mockImplementationOnce(async (update) => {
    update(structuredClone([item]))
    await pending.promise
  })
  openDialog(item)
  fireEvent.change(screen.getByRole('textbox', { name: 'Hosts Title' }), {
    target: { value: 'After' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  mocks.currentHosts = { ...item, last_attempt_ms: 200, last_attempt: 'New' }
  await act(async () => pending.resolve())
  expect(mocks.currentHosts).toMatchObject({
    title: 'After',
    last_attempt_ms: 200,
    last_attempt: 'New',
  })
})

it.each([{ domain_results: 'bad' }, { domain_results: [], domain_refresh_status: 'failed' }])(
  'reports successful URL refreshes despite leftover DNS fields: %j',
  async (metadata) => {
    const item = {
      id: 'url',
      type: 'remote',
      source: 'url',
      url: 'https://example.com/hosts',
      ...metadata,
    }
    mocks.actions.refreshHosts.mockResolvedValue({ success: true, data: item })
    openDialog(item)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(mocks.showSuccessNotification).toHaveBeenCalledWith({
        title: 'Refresh',
        message: 'Success!',
      }),
    )
    expect(mocks.showErrorNotification).not.toHaveBeenCalled()
  },
)

it('keeps a default URL source consistent through two queued edits of the same node', async () => {
  const initial = { id: 'u1', type: 'remote', title: 'Original', url: 'https://example.com/hosts' }
  let disk = structuredClone([initial]) as any[]
  const pending = deferred()
  let tail = Promise.resolve()
  let saves = 0
  mocks.hostsData.list = structuredClone(disk)
  mocks.setList.mockImplementation((update) => {
    const save = ++saves
    const next = tail.then(async () => {
      disk = update(structuredClone(disk))
      if (save === 1) await pending.promise
      mocks.hostsData.list = structuredClone(disk)
    })
    tail = next
    return next
  })
  openDialog(initial)
  fireEvent.click(screen.getByRole('radio', { name: 'Domain' }))
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(disk[0].source).toBe('domain'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  act(() => mocks.handlers.get('edit_hosts_info')?.(initial))
  fireEvent.change(screen.getByRole('textbox', { name: 'Hosts Title' }), {
    target: { value: 'Second edit' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await act(async () => {
    pending.resolve()
    await tail
  })
  expect(disk[0]).toMatchObject({
    title: 'Second edit',
    source: 'url',
    url: 'https://example.com/hosts',
  })
  expect(disk[0].domains).toBeUndefined()
  expect(disk[0].domain_results).toEqual([])
})

it('shows the saved domain list while its refresh is pending without discarding fallback cache', async () => {
  const item = {
    id: 'd1',
    type: 'remote',
    source: 'domain',
    domains: ['a.test', 'b.test'],
    domain_results: [
      { domain: 'a.test', status: 'resolved', ips: ['192.0.2.1'] },
      { domain: 'b.test', status: 'resolved', ips: ['192.0.2.2'] },
    ],
    domain_refresh_status: 'complete',
    last_attempt_ms: 100,
  }
  mocks.hostsData.list = [item]
  mocks.currentHosts = item
  mocks.actions.refreshHosts.mockReturnValueOnce(new Promise(() => {}))
  openDialog(item)
  fireEvent.change(screen.getByRole('textbox', { name: 'Domain list' }), {
    target: { value: 'a.test\nc.test' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  await waitFor(() => expect(mocks.actions.refreshHosts).toHaveBeenCalledWith('d1'))
  expect(mocks.currentHosts.domains).toEqual(['a.test', 'c.test'])
  expect(mocks.currentHosts.domain_results).toEqual(item.domain_results)
  render(
    <MantineProvider>
      <DomainResolutionResults hosts={mocks.currentHosts} />
    </MantineProvider>,
  )
  expect(
    screen.queryByText('1 updated · 0 using previous IPs · 0 unresolved · 1 pending'),
  ).not.toBeNull()
  expect(screen.queryByText('b.test')).toBeNull()
  expect(screen.queryByText('c.test')).not.toBeNull()
})
