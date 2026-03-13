import { describe, expect, it } from 'vitest'
import {
  getLineEndingForPlatform,
  normalizeLineEndings,
  restoreLineEndings,
} from '../../src/common/newlines'

describe('newlines', () => {
  it('normalizes CRLF and CR to LF', () => {
    expect(normalizeLineEndings('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('uses CRLF on Windows', () => {
    expect(getLineEndingForPlatform('win32')).toBe('\r\n')
  })

  it('uses LF on non-Windows platforms', () => {
    expect(getLineEndingForPlatform('darwin')).toBe('\n')
    expect(getLineEndingForPlatform('linux')).toBe('\n')
  })

  it('restores normalized text to CRLF', () => {
    expect(restoreLineEndings('a\nb\n', '\r\n')).toBe('a\r\nb\r\n')
  })
})
