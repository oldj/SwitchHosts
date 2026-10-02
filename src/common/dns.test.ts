import { describe, expect, it } from 'vitest'
import { getDomainList, parseDomains } from './dns'

describe('domain list input', () => {
  it('extracts domains, ignores blank lines, deduplicates and preserves order', () => {
    expect(
      parseDomains(
        ' GitHub.COM\r\n\r\nhttps://api.github.com:443/path?q=a\r\ngithub.com\nexample.org.',
      ),
    ).toEqual({
      domains: ['github.com', 'api.github.com', 'example.org'],
      errors: [],
      duplicates: 1,
      normalized: 3,
    })
  })

  it('reports original line numbers without discarding invalid input', () => {
    expect(parseDomains('github.com\n\nnot a domain\n*.example.com\n127.0.0.1')).toEqual({
      domains: ['github.com'],
      errors: [
        { line: 3, value: 'not a domain' },
        { line: 4, value: '*.example.com' },
        { line: 5, value: '127.0.0.1' },
      ],
      duplicates: 0,
      normalized: 0,
    })
  })

  it('does not silently truncate several domains on one line', () => {
    expect(parseDomains('https://github.com/ https://example.com').errors).toHaveLength(1)
  })

  it.each([
    'github.com:api.github.com',
    'https://github.com:443,example.org',
    'https://example.com\\@github.com/path',
  ])('reports the whole invalid URL line without extracting a partial domain: %s', (input) => {
    expect(parseDomains(`valid.example.org\n${input}`)).toEqual({
      domains: ['valid.example.org'],
      errors: [{ line: 2, value: input }],
      duplicates: 0,
      normalized: 0,
    })
  })

  it('normalizes international URL hostnames to the ASCII name used by the resolver', () => {
    expect(parseDomains('https://bücher.de/path\nxn--bcher-kva.de')).toEqual({
      domains: ['xn--bcher-kva.de'],
      errors: [],
      duplicates: 1,
      normalized: 1,
    })
  })

  it('reads legacy data and gives an explicit domain list precedence', () => {
    expect(getDomainList({ url: 'github.com' })).toEqual(['github.com'])
    expect(getDomainList({ domains: ['example.com'], url: 'github.com' })).toEqual(['example.com'])
    expect(getDomainList({ domains: [], url: 'github.com' })).toEqual([])
    expect(getDomainList(null)).toEqual([])
  })
})
