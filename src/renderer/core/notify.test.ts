import type { LanguageDict } from '@common/types'
import { describe, expect, it } from 'vitest'

import { getErrorMessage, getFriendlyUpdateErrorMessage } from './notify'

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

describe('getFriendlyUpdateErrorMessage', () => {
  const lang = {
    check_update_failed: 'CHECK_FAILED',
    update_error_proxy: 'PROXY',
    update_error_signature: 'SIG',
    update_error_platform: 'PLAT',
    update_error_unavailable: 'UNAVAIL',
    update_error_network: 'NET',
    update_error_install: 'INSTALL',
  } as unknown as LanguageDict

  it('routes invalid proxy errors to the proxy bucket', () => {
    expect(getFriendlyUpdateErrorMessage(new Error('invalid proxy http://x'), lang)).toBe('PROXY')
  })

  it('routes signature failures to the signature bucket', () => {
    expect(getFriendlyUpdateErrorMessage(new Error('minisign verification failed'), lang)).toBe(
      'SIG',
    )
  })

  it('routes platform-not-found errors to the platform bucket', () => {
    expect(
      getFriendlyUpdateErrorMessage(new Error('platform linux-x86_64-deb not found'), lang),
    ).toBe('PLAT')
  })

  it('routes 404 / fetch / json errors to the unavailable bucket', () => {
    expect(getFriendlyUpdateErrorMessage(new Error('release not found (404)'), lang)).toBe(
      'UNAVAIL',
    )
    expect(getFriendlyUpdateErrorMessage(new Error('failed to deserialize JSON'), lang)).toBe(
      'UNAVAIL',
    )
  })

  it('routes network errors to the network bucket', () => {
    expect(getFriendlyUpdateErrorMessage(new Error('connect ECONNREFUSED'), lang)).toBe('NET')
    expect(getFriendlyUpdateErrorMessage(new Error('TLS handshake timed out'), lang)).toBe('NET')
  })

  it('routes installer errors to the install bucket', () => {
    expect(getFriendlyUpdateErrorMessage(new Error('dpkg permission denied'), lang)).toBe('INSTALL')
  })

  it('prefers proxy classification over network when both keywords appear', () => {
    expect(
      getFriendlyUpdateErrorMessage(new Error('proxy connect timeout to 10.0.0.1'), lang),
    ).toBe('PROXY')
  })

  it('falls through to the raw error message when no keyword matches', () => {
    expect(getFriendlyUpdateErrorMessage(new Error('some unexpected condition'), lang)).toBe(
      'some unexpected condition',
    )
  })

  it('uses lang.check_update_failed as default when message is missing and no fallback override', () => {
    expect(getFriendlyUpdateErrorMessage(null, lang)).toBe('CHECK_FAILED')
  })

  it('honors a caller-provided fallback message', () => {
    expect(getFriendlyUpdateErrorMessage(null, lang, 'CUSTOM')).toBe('CUSTOM')
  })
})
