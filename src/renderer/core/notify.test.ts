import { describe, expect, it } from 'vitest'

import { getErrorMessage } from './notify'

describe('getErrorMessage', () => {
  it('returns Error.message when present', () => {
    expect(getErrorMessage(new Error('disk full'), 'fallback')).toBe('disk full')
  })

  it('falls back when Error.message is empty or whitespace', () => {
    expect(getErrorMessage(new Error('   '), 'fallback')).toBe('fallback')
  })

  it('returns string errors verbatim', () => {
    expect(getErrorMessage('plain text', 'fallback')).toBe('plain text')
  })

  it('reads reason from Tauri-shaped error objects', () => {
    const tauriErr = {
      kind: 'side_effect',
      key: 'launch_at_login',
      reason: 'permission denied by SMAppService',
    }
    expect(getErrorMessage(tauriErr, 'fallback')).toBe('permission denied by SMAppService')
  })

  it('falls back to message and error fields when reason is absent', () => {
    expect(getErrorMessage({ message: 'oops' }, 'fallback')).toBe('oops')
    expect(getErrorMessage({ error: 'boom' }, 'fallback')).toBe('boom')
  })

  it('uses the fallback for unknown shapes', () => {
    expect(getErrorMessage({ code: 42 }, 'fallback')).toBe('fallback')
    expect(getErrorMessage(null, 'fallback')).toBe('fallback')
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback')
  })
})
