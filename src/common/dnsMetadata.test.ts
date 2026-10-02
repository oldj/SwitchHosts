import type { IHostsListObject } from './data'
import { getDomainList, getDomainResults, getRefreshMetadata, mergeRefreshMetadata } from './dns'
import { describe, expect, it } from 'vitest'

const imported = (data: unknown) => data as IHostsListObject

describe('imported domain metadata', () => {
  it('keeps editable strings and ignores non-string domain entries', () => {
    expect(
      getDomainList(imported({ domains: ['github.com', {}, null, 42, 'bad domain'] })),
    ).toEqual(['github.com', 'bad domain'])
  })

  it('does not revive a legacy domain when an explicit list is malformed', () => {
    for (const domains of [null, {}, 'example.com', []]) {
      expect(getDomainList(imported({ domains, url: 'old.example.com' }))).toEqual([])
    }
    expect(getDomainList(imported({ url: {} }))).toEqual([])
  })

  it('ignores malformed cache rows while retaining usable results', () => {
    const valid = { domain: 'github.com', status: 'resolved', ips: ['192.0.2.1'] }
    expect(
      getDomainResults(
        imported({
          domain_results: [
            null,
            'bad',
            {},
            { domain: 'missing-ips.example', status: 'failed' },
            { domain: {}, status: 'failed', ips: [] },
            { domain: 'bad-status.example', status: 'unknown', ips: [] },
            { domain: 'bad-ips.example', status: 'resolved', ips: [{}] },
            valid,
            valid,
          ],
        }),
      ),
    ).toEqual([valid])
  })

  it('ignores a non-array cache and unsafe optional display fields', () => {
    for (const domain_results of [null, {}, 'bad']) {
      expect(getDomainResults(imported({ domain_results }))).toEqual([])
    }
    expect(
      getDomainResults(
        imported({
          domain_results: [
            {
              domain: 'github.com',
              status: 'stale',
              ips: ['192.0.2.1'],
              error: {},
              last_success: [],
              last_success_ms: 'invalid',
            },
          ],
        }),
      ),
    ).toEqual([{ domain: 'github.com', status: 'stale', ips: ['192.0.2.1'] }])
  })

  it('preserves legitimate status, errors and successful lookup timestamps', () => {
    const result = {
      domain: 'github.com',
      status: 'stale',
      ips: ['192.0.2.1'],
      error: 'Request timed out',
      last_success: '2026-10-02 12:00:00',
      last_success_ms: 42,
    }
    expect(getDomainResults(imported({ domain_results: [result] }))).toEqual([result])
  })
})

describe('refresh metadata ordering and ownership', () => {
  const current: IHostsListObject = {
    id: 'dns',
    type: 'remote',
    source: 'domain',
    domains: ['example.com'],
    title: 'Unsaved title',
    last_attempt_ms: 200,
    last_attempt: 'Latest attempt',
    last_refresh_ms: 100,
    last_refresh: 'Latest success',
  }

  it('merges only metadata for the same target while retaining local form fields', () => {
    const incoming = { ...current, title: 'Saved title', last_attempt_ms: 300, last_attempt: 'New' }
    expect(mergeRefreshMetadata(current, incoming)).toEqual({
      ...current,
      last_attempt_ms: 300,
      last_attempt: 'New',
    })
  })

  it.each([
    { id: 'different' },
    { type: 'local' },
    { source: 'url', url: 'https://example.com/hosts' },
    { domains: ['other.example'] },
    { domains: ['example.com', 'other.example'] },
    { domains: ['example.com', 42] },
  ])('ignores a snapshot from a different node or target: %j', (changes) => {
    const incoming = imported({ ...current, ...changes, last_attempt_ms: 300 })
    expect(mergeRefreshMetadata(current, incoming)).toBe(current)
  })

  it('accepts a legacy single-domain target and normalized domain spellings', () => {
    const legacy = { ...current, domains: undefined, url: ' EXAMPLE.com ' }
    const incoming = { ...current, last_attempt_ms: 300, last_attempt: 'New' }
    expect(mergeRefreshMetadata(legacy, incoming)).toMatchObject({
      url: ' EXAMPLE.com ',
      domains: undefined,
      last_attempt_ms: 300,
    })
  })

  it('does not replace a newer failed attempt with an older successful response', () => {
    const older = { ...current, last_attempt_ms: 150, last_refresh_ms: 150 }
    expect(mergeRefreshMetadata(current, older)).toBe(current)
    expect(mergeRefreshMetadata(current, { ...older, last_attempt_ms: undefined })).toBe(current)
  })

  it('uses the legacy success timestamp for URL targets and requires the URL to match', () => {
    const item: IHostsListObject = {
      id: 'url',
      type: 'remote',
      url: 'https://example.com/hosts',
      last_refresh_ms: 200,
    }
    expect(mergeRefreshMetadata(item, { ...item, last_refresh_ms: 100 })).toBe(item)
    expect(
      mergeRefreshMetadata(item, {
        ...item,
        url: 'https://other.example/hosts',
        last_refresh_ms: 300,
      }),
    ).toBe(item)
    expect(
      mergeRefreshMetadata(item, { ...item, source: 'url', last_refresh_ms: 300 }),
    ).toMatchObject({
      last_refresh_ms: 300,
    })
  })

  it('keeps malformed imported timestamps out of metadata updates', () => {
    expect(
      getRefreshMetadata(
        imported({
          last_attempt: {},
          last_refresh: [],
          last_attempt_ms: '300',
          last_refresh_ms: NaN,
        }),
      ),
    ).toMatchObject({
      last_attempt: undefined,
      last_refresh: undefined,
      last_attempt_ms: undefined,
      last_refresh_ms: undefined,
    })
  })
})
