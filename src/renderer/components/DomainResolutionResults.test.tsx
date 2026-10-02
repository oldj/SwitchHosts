// @vitest-environment jsdom

import type { IHostsListObject } from '@common/data'
import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@renderer/models/useI18n', async () => {
  const { I18N } = await import('@common/i18n')
  const i18n = new I18N('en')
  return { default: () => ({ lang: i18n.lang, i18n }) }
})

import DomainResolutionResults from './DomainResolutionResults'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }),
})

const item: IHostsListObject = {
  id: 'dns',
  type: 'remote',
  source: 'domain',
  domains: ['a.test', 'c.test'],
  domain_results: [
    { domain: 'a.test', status: 'resolved', ips: ['192.0.2.1'] },
    { domain: 'b.test', status: 'resolved', ips: ['192.0.2.2'] },
  ],
}
const view = (hosts: IHostsListObject) => (
  <MantineProvider>
    <DomainResolutionResults hosts={hosts} />
  </MantineProvider>
)

afterEach(cleanup)

it('projects cached results onto the saved list without changing the cache', () => {
  const before = structuredClone(item)
  const { container } = render(view(item))
  expect(
    screen.getByText('1 updated · 0 using previous IPs · 0 unresolved · 1 pending'),
  ).toBeTruthy()
  expect(screen.queryByText('b.test')).toBeNull()
  expect(screen.getByText('Pending resolution')).toBeTruthy()
  expect(
    Array.from(container.querySelectorAll('li')).map((row) => row.firstChild?.textContent),
  ).toEqual(['a.testUpdated', 'c.testPending resolution'])
  expect(item).toEqual(before)
})

it('uses saved domain order and normalization while retaining status details', () => {
  const { container } = render(
    view({
      ...item,
      domains: [' C.TEST ', 'a.test', 'c.test', '', 'b.test'],
      domain_results: [
        { domain: 'a.test', status: 'resolved', ips: ['192.0.2.1'], last_success: 'Yesterday' },
        { domain: 'b.test', status: 'failed', ips: [], error: 'No A record' },
        { domain: 'c.test', status: 'stale', ips: ['192.0.2.3'], error: 'Request timed out' },
      ],
    }),
  )
  expect(screen.getByText('1 updated · 1 using previous IPs · 1 unresolved')).toBeTruthy()
  expect(
    Array.from(container.querySelectorAll('li')).map(
      (row) => row.firstChild?.firstChild?.textContent,
    ),
  ).toEqual(['c.test', 'a.test', 'b.test'])
  expect(screen.getByText('192.0.2.3')).toBeTruthy()
  expect(screen.getByText('Request timed out')).toBeTruthy()
  expect(screen.getByText('No A record')).toBeTruthy()
  expect(screen.getByText('Last success: Yesterday')).toBeTruthy()
})

it('shows domains without cached results as pending until their refresh finishes', () => {
  const { rerender } = render(view({ ...item, domain_results: [] }))
  expect(
    screen.getByText('0 updated · 0 using previous IPs · 0 unresolved · 2 pending'),
  ).toBeTruthy()
  expect(screen.getAllByText('Pending resolution')).toHaveLength(2)
  rerender(
    view({
      ...item,
      domain_results: [
        { domain: 'a.test', status: 'resolved', ips: ['192.0.2.1'] },
        { domain: 'c.test', status: 'failed', ips: [], error: 'No A record' },
      ],
    }),
  )
  expect(screen.queryByText('Pending resolution')).toBeNull()
  expect(screen.getByText('1 updated · 0 using previous IPs · 1 unresolved')).toBeTruthy()
})

it('does not display cached domains for an explicitly empty list', () => {
  const { container } = render(view({ ...item, domains: [], url: 'legacy.test' }))
  expect(container.querySelector('details')).toBeNull()
})
