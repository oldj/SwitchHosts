function getCauseField(cause, field) {
  if (!cause || !(field in cause)) return null
  const value = cause[field]
  return value === null || value === undefined ? null : String(value)
}

function normalizeTarget(target) {
  if (!target) {
    return null
  }

  if (typeof target === 'string') {
    return target
  }

  if (typeof target === 'object' && target !== null) {
    if ('pathname' in target && typeof target.pathname === 'string') {
      const search = 'search' in target && typeof target.search === 'string' ? target.search : ''
      return `${target.pathname}${search}`
    }

    if ('href' in target && typeof target.href === 'string') {
      return target.href
    }
  }

  return String(target)
}

function getCause(error) {
  if (!(error instanceof Error)) {
    return null
  }

  if (typeof error.cause === 'object' && error.cause !== null) {
    return error.cause
  }

  return null
}

function pickEnumerableFields(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => {
      return entryValue === null || [ 'string', 'number', 'boolean' ].includes(typeof entryValue)
    })

  return entries.length > 0 ? Object.fromEntries(entries) : null
}

export function extractErrorDetails(error) {
  const normalizedError = error instanceof Error ? error : new Error(String(error))
  const cause = getCause(normalizedError)

  return {
    causeCode: getCauseField(cause, 'code'),
    causeErrno: getCauseField(cause, 'errno'),
    causeHostname: getCauseField(cause, 'hostname'),
    causeMessage: getCauseField(cause, 'message'),
    causeSyscall: getCauseField(cause, 'syscall'),
    errorMessage: normalizedError.message,
    errorName: normalizedError.name || 'Error',
    rawCause: pickEnumerableFields(cause),
    stack: normalizedError.stack || null,
  }
}

export function buildDiagnostic({
  attempt,
  error,
  fileIndex = null,
  fileName = null,
  httpStatus = null,
  maxAttempts,
  method,
  progressSnapshot = null,
  retryable,
  stage,
  target = null,
}) {
  const errorDetails = extractErrorDetails(error)

  return {
    attempt,
    causeCode: errorDetails.causeCode,
    causeErrno: errorDetails.causeErrno,
    causeHostname: errorDetails.causeHostname,
    causeMessage: errorDetails.causeMessage,
    causeSyscall: errorDetails.causeSyscall,
    currentFileBytes: progressSnapshot?.currentFileBytes ?? null,
    errorMessage: errorDetails.errorMessage,
    errorName: errorDetails.errorName,
    fileIndex,
    fileName,
    httpStatus,
    maxAttempts,
    method,
    retryable: Boolean(retryable),
    stage,
    target: normalizeTarget(target),
    totalFiles: progressSnapshot?.totalFiles ?? null,
    totalUploadedBytes: progressSnapshot?.totalUploadedBytes ?? null,
  }
}

export function formatDiagnosticSummary(diagnostic) {
  const subject = diagnostic.fileName || diagnostic.target || diagnostic.stage
  const details = [ `attempt ${diagnostic.attempt}/${diagnostic.maxAttempts}` ]

  if (diagnostic.fileIndex != null && diagnostic.totalFiles) {
    details.push(`file ${diagnostic.fileIndex}/${diagnostic.totalFiles}`)
  }

  if (diagnostic.httpStatus) {
    details.push(`status=${diagnostic.httpStatus}`)
  }

  if (diagnostic.causeCode) {
    details.push(`cause=${diagnostic.causeCode}`)
  }

  if (diagnostic.causeMessage) {
    details.push(`message=${diagnostic.causeMessage}`)
  } else if (diagnostic.errorMessage) {
    details.push(`message=${diagnostic.errorMessage}`)
  }

  return `${diagnostic.stage} failed for ${subject} (${details.join(', ')})`
}

export function formatRetrySummary(diagnostic, delayLabel) {
  const subject = diagnostic.fileName || diagnostic.target || diagnostic.stage
  const details = [ `attempt ${Math.min(diagnostic.attempt + 1, diagnostic.maxAttempts)}/${diagnostic.maxAttempts}` ]

  if (diagnostic.fileIndex != null && diagnostic.totalFiles) {
    details.unshift(`file ${diagnostic.fileIndex}/${diagnostic.totalFiles}`)
  }

  if (diagnostic.httpStatus) {
    details.push(`status=${diagnostic.httpStatus}`)
  }

  if (diagnostic.causeCode) {
    details.push(`cause=${diagnostic.causeCode}`)
  }

  details.push(`in ${delayLabel}`)

  return `retrying ${diagnostic.stage} ${subject} (${details.join(', ')})`
}

export function buildDebugPayload(diagnostic, error) {
  const errorDetails = extractErrorDetails(error)

  return {
    diagnostic,
    error: {
      cause: errorDetails.rawCause,
      errorMessage: errorDetails.errorMessage,
      errorName: errorDetails.errorName,
      stack: errorDetails.stack,
    },
  }
}

export function attachDiagnostic(error, diagnostic) {
  const normalizedError = error instanceof Error ? error : new Error(String(error))
  normalizedError.diagnostic = diagnostic
  return normalizedError
}
