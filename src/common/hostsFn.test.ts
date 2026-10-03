import { describe, expect, it } from 'vitest'

import { extractDomain, isValidDomain } from './hostsFn'

describe('isValidDomain', () => {
  it.each(['github.com', 'a-b.example.co', 'raw.githubusercontent.com', '1.2.3.4.com'])(
    'accepts %s',
    (s) => {
      expect(isValidDomain(s)).toBe(true)
    },
  )

  it.each([
    '',
    '   ',
    'github',
    'github.com.',
    'https://github.com',
    'github.com/x',
    'github.com:443',
    'a..b',
    '.a.com',
    '-a.com',
    'a-.com',
    '192.168.1.1',
    'a b.com',
    `${'a'.repeat(64)}.com`,
    `${'a'.repeat(250)}.com`,
  ])('rejects %s', (s) => {
    expect(isValidDomain(s)).toBe(false)
  })
})

describe('extractDomain', () => {
  it.each([
    ['dblp.org', 'dblp.org'],
    ['https://dblp.org/', 'dblp.org'],
    ['https://dblp.org/search?q=x', 'dblp.org'],
    ['http://user:pass@github.com:8080/a/b', 'github.com'],
    ['dblp.org/search?q=x', 'dblp.org'],
    ['github.com:443', 'github.com'],
    ['dblp.org.', 'dblp.org'],
    ['https://github.com.:443/path', 'github.com'],
    ['ftp://ftp.example.org/file', 'ftp.example.org'],
    ['ws://socket.example.org:8080/path', 'socket.example.org'],
    ['wss://socket.example.org/path', 'socket.example.org'],
    ['bücher.de', 'xn--bcher-kva.de'],
    ['https://bücher.de/path', 'xn--bcher-kva.de'],
  ])('extracts %j → %j', (input, expected) => {
    expect(extractDomain(input)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    'https://',
    'bad domain!',
    '192.168.1.1/x',
    'not a domain',
    'github.com:api.github.com',
    'https://github.com:443,example.org',
    'https://github.com:bad-port/path',
    'https://github.com:65536/path',
    'https://example.com\\@github.com/path',
    'example.com\\@github.com',
    'https://github.com/ https://example.org/',
    'https://127.10/path',
    'file://github.com/path',
    'javascript://github.com/path',
    'custom://github.com/path',
  ])('returns null for %j', (input) => {
    expect(extractDomain(input)).toBeNull()
  })
})
