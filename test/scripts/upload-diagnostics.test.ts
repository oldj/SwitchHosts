import { describe, expect, it } from 'vitest'
import {
  attachDiagnostic,
  buildDebugPayload,
  buildDiagnostic,
  extractErrorDetails,
  formatDiagnosticSummary,
  formatRetrySummary,
} from '../../scripts/upload-diagnostics.mjs'

describe('upload diagnostics', () => {
  it('extracts network cause details from fetch failures', () => {
    const error = new TypeError('fetch failed', {
      cause: {
        code: 'ECONNRESET',
        message: 'socket hang up',
        syscall: 'read',
      },
    })

    expect(extractErrorDetails(error)).toMatchObject({
      causeCode: 'ECONNRESET',
      causeMessage: 'socket hang up',
      causeSyscall: 'read',
      errorMessage: 'fetch failed',
      errorName: 'TypeError',
    })
  })

  it('formats upload failures with attempt, file index and cause code', () => {
    const diagnostic = buildDiagnostic({
      attempt: 3,
      error: new TypeError('fetch failed', {
        cause: {
          code: 'ECONNRESET',
          message: 'socket hang up',
        },
      }),
      fileIndex: 5,
      fileName: 'SwitchHosts-v4.3.0.6136-linux-amd64.deb',
      maxAttempts: 3,
      method: 'POST',
      progressSnapshot: {
        currentFileBytes: 123,
        totalFiles: 24,
        totalUploadedBytes: 456,
      },
      retryable: false,
      stage: 'upload-asset',
      target: '/upload',
    })

    expect(formatDiagnosticSummary(diagnostic)).toContain('upload-asset failed')
    expect(formatDiagnosticSummary(diagnostic)).toContain('attempt 3/3')
    expect(formatDiagnosticSummary(diagnostic)).toContain('file 5/24')
    expect(formatDiagnosticSummary(diagnostic)).toContain('cause=ECONNRESET')
  })

  it('formats dns failures with the underlying cause code', () => {
    const diagnostic = buildDiagnostic({
      attempt: 2,
      error: new TypeError('fetch failed', {
        cause: {
          code: 'EAI_AGAIN',
          hostname: 'api.github.com',
          message: 'getaddrinfo EAI_AGAIN api.github.com',
        },
      }),
      maxAttempts: 3,
      method: 'GET',
      retryable: true,
      stage: 'find-release',
      target: '/repos/oldj/SwitchHosts/releases?per_page=100&page=1',
    })

    expect(formatRetrySummary(diagnostic, '1.5s')).toContain('cause=EAI_AGAIN')
    expect(formatDiagnosticSummary(diagnostic)).toContain('message=getaddrinfo EAI_AGAIN api.github.com')
  })

  it('includes http status for api failures', () => {
    const diagnostic = buildDiagnostic({
      attempt: 3,
      error: new Error('GET /repos/... failed: 503 Service Unavailable'),
      httpStatus: 503,
      maxAttempts: 3,
      method: 'GET',
      retryable: false,
      stage: 'find-release',
      target: '/repos/oldj/SwitchHosts/releases?per_page=100&page=1',
    })

    expect(formatDiagnosticSummary(diagnostic)).toContain('status=503')
    expect(formatRetrySummary(diagnostic, '3.0s')).toContain('status=503')
  })

  it('builds debug payloads with stack and raw cause fields', () => {
    const error = new TypeError('fetch failed', {
      cause: {
        code: 'ECONNRESET',
        errno: -54,
        message: 'socket hang up',
      },
    })
    const diagnostic = buildDiagnostic({
      attempt: 3,
      error,
      maxAttempts: 3,
      method: 'POST',
      retryable: false,
      stage: 'upload-asset',
      target: '/upload',
    })

    expect(buildDebugPayload(diagnostic, error)).toMatchObject({
      diagnostic: {
        causeCode: 'ECONNRESET',
        stage: 'upload-asset',
      },
      error: {
        cause: {
          code: 'ECONNRESET',
          errno: -54,
          message: 'socket hang up',
        },
        errorMessage: 'fetch failed',
      },
    })
  })

  it('falls back to the top-level error message when no cause exists', () => {
    const diagnostic = buildDiagnostic({
      attempt: 1,
      error: new Error('plain failure'),
      maxAttempts: 3,
      method: 'DELETE',
      retryable: false,
      stage: 'delete-asset',
      target: '/repos/oldj/SwitchHosts/releases/assets/1',
    })

    expect(formatDiagnosticSummary(diagnostic)).toContain('message=plain failure')
  })

  it('attaches diagnostics to error instances for top-level reporting', () => {
    const error = new Error('plain failure')
    const diagnostic = buildDiagnostic({
      attempt: 1,
      error,
      maxAttempts: 3,
      method: 'DELETE',
      retryable: false,
      stage: 'delete-asset',
      target: '/repos/oldj/SwitchHosts/releases/assets/1',
    })

    const attached = attachDiagnostic(error, diagnostic)
    expect(attached.diagnostic).toEqual(diagnostic)
  })
})
