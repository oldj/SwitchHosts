import prettyBytes from 'pretty-bytes'
import ProgressBar from 'progress'

const PROGRESS_BAR_FORMAT = '[:bar]'
const PROGRESS_BAR_WIDTH = 24

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function formatPercent(value) {
  return `${clamp(value, 0, 100).toFixed(1)}%`
}

export function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '--:--'
  }

  const roundedSeconds = Math.ceil(seconds)
  const hours = Math.floor(roundedSeconds / 3600)
  const minutes = Math.floor((roundedSeconds % 3600) / 60)
  const secs = roundedSeconds % 60

  if (hours > 0) {
    return [ hours, minutes, secs ].map((value) => String(value).padStart(2, '0')).join(':')
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function truncateFileName(fileName, maxLength = 36) {
  if (fileName.length <= maxLength) {
    return fileName
  }

  if (maxLength <= 3) {
    return fileName.slice(0, maxLength)
  }

  const extensionIndex = fileName.lastIndexOf('.')
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : ''
  const suffixLength = clamp(extension.length + 10, 8, maxLength - 3)
  const prefixLength = Math.max(maxLength - suffixLength - 3, 1)

  return `${fileName.slice(0, prefixLength)}...${fileName.slice(-suffixLength)}`
}

export function formatProgressMessage(snapshot) {
  return (
    `progress ${formatPercent(snapshot.totalPercent)} ` +
    `file ${snapshot.currentFileIndex}/${snapshot.totalFiles} ` +
    `current ${formatPercent(snapshot.currentFilePercent)} ` +
    `speed ${snapshot.speedLabel} ` +
    `eta ${snapshot.etaLabel} ` +
    `${snapshot.transferredLabel}/${snapshot.totalLabel} ` +
    `${snapshot.displayFileName}`
  )
}

export function fitFileNameToWidth(fileName, availableWidth, fallbackMaxLength = 36) {
  if (!Number.isFinite(availableWidth)) {
    return fileName
  }

  if (availableWidth <= 0) {
    return truncateFileName(fileName, Math.max(fallbackMaxLength, 8))
  }

  if (fileName.length <= availableWidth) {
    return fileName
  }

  return truncateFileName(fileName, Math.max(Math.floor(availableWidth), 8))
}

export function formatTtyProgressLines(snapshot, barText, columns) {
  const firstLine = `upload ${barText} ${formatPercent(snapshot.totalPercent)} ${snapshot.transferredLabel}/${snapshot.totalLabel}`
  const secondLinePrefix =
    `file ${snapshot.currentFileIndex}/${snapshot.totalFiles} ` +
    `current ${formatPercent(snapshot.currentFilePercent)} ` +
    `speed ${snapshot.speedLabel} ` +
    `eta ${snapshot.etaLabel} `
  const displayFileName = fitFileNameToWidth(
    snapshot.currentFileName || snapshot.displayFileName,
    typeof columns === 'number' ? columns - secondLinePrefix.length : undefined,
  )

  return [
    firstLine,
    `${secondLinePrefix}${displayFileName}`,
  ]
}

function buildSnapshot(state, now) {
  const elapsedSeconds =
    state.startedAt === null ? 0 : Math.max((now() - state.startedAt) / 1000, 0)
  const speedBytesPerSecond =
    elapsedSeconds > 0 ? state.totalUploadedBytes / elapsedSeconds : 0
  const remainingBytes = Math.max(state.totalBytes - state.totalUploadedBytes, 0)
  const etaSeconds =
    remainingBytes === 0 ? 0 : speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond : null
  const totalPercent =
    state.totalBytes === 0 ? (state.finished ? 100 : 0) : (state.totalUploadedBytes / state.totalBytes) * 100
  const currentFilePercent =
    state.currentFileSize === 0
      ? state.currentFileComplete
        ? 100
        : 0
      : (state.currentFileBytes / state.currentFileSize) * 100

  return {
    currentFileBytes: state.currentFileBytes,
    currentFileIndex: state.currentFileIndex,
    currentFileName: state.currentFileName,
    currentFilePercent: clamp(currentFilePercent, 0, 100),
    currentFileSize: state.currentFileSize,
    displayFileName: state.currentFileName || '-',
    etaLabel: formatEta(etaSeconds),
    etaSeconds,
    speedBytesPerSecond,
    speedLabel: `${prettyBytes(speedBytesPerSecond)}/s`,
    totalBytes: state.totalBytes,
    totalFiles: state.totalFiles,
    totalPercent: clamp(totalPercent, 0, 100),
    totalUploadedBytes: state.totalUploadedBytes,
    totalLabel: prettyBytes(state.totalBytes),
    transferredLabel: prettyBytes(state.totalUploadedBytes),
  }
}

function createCaptureStream(columns = 120) {
  let buffer = ''

  return {
    clearBuffer() {
      buffer = ''
    },
    clearLine() {},
    columns,
    cursorTo() {
      buffer = ''
    },
    isTTY: true,
    moveCursor() {},
    write(chunk) {
      buffer += chunk
      return true
    },
    get value() {
      return buffer
    },
  }
}

export function createUploadProgressTracker({
  totalBytes,
  totalFiles,
  isTTY = Boolean(process.stdout.isTTY),
  log = console.log,
  now = () => Date.now(),
  percentStep = 5,
  ProgressBarClass = ProgressBar,
  stream = process.stdout,
  throttleMs = 1000,
} = {}) {
  const state = {
    currentFileBytes: 0,
    currentFileComplete: false,
    currentFileIndex: 0,
    currentFileName: '',
    currentFileSize: 0,
    finished: false,
    startedAt: null,
    totalBytes,
    totalFiles,
    totalUploadedBytes: 0,
  }

  let lastLoggedAt = -Infinity
  let lastLoggedBucket = -1
  let hasRendered = false

  const progressTotal = Math.max(totalBytes, 1)
  const barCaptureStream = createCaptureStream()
  const bar =
    isTTY && totalFiles > 0
      ? new ProgressBarClass(PROGRESS_BAR_FORMAT, {
          clear: false,
          complete: '=',
          incomplete: ' ',
          renderThrottle: 100,
          stream: barCaptureStream,
          total: progressTotal,
          width: PROGRESS_BAR_WIDTH,
        })
      : null

  function safeClearLine(direction = 0) {
    stream.clearLine?.(direction)
  }

  function safeCursorTo(column = 0) {
    stream.cursorTo?.(column)
  }

  function safeMoveCursor(dx = 0, dy = 0) {
    stream.moveCursor?.(dx, dy)
  }

  function getBarText(snapshot, force = false) {
    if (!bar) {
      return ''
    }

    const ratio = progressTotal > 0 ? clamp(snapshot.totalUploadedBytes / progressTotal, 0, 1) : 0
    barCaptureStream.clearBuffer()

    if (force) {
      bar.update(ratio)
      bar.render(undefined, true)
    } else {
      bar.update(ratio)
    }

    return barCaptureStream.value || bar.lastDraw || '[]'
  }

  function clearTTYRender() {
    if (!hasRendered || !stream.isTTY) {
      return
    }

    safeClearLine(0)
    safeCursorTo(0)
    safeMoveCursor(0, -1)
    safeClearLine(0)
    safeCursorTo(0)
  }

  function renderTTY(force = false) {
    const snapshot = getSnapshot()
    const barText = getBarText(snapshot, force)
    const [ firstLine, secondLine ] = formatTtyProgressLines(snapshot, barText, stream.columns)

    if (hasRendered) {
      clearTTYRender()
    }

    stream.write(firstLine)
    safeClearLine(1)
    stream.write('\n')
    stream.write(secondLine)
    safeClearLine(1)

    hasRendered = true
    return snapshot
  }

  function terminateTTYRender() {
    if (!hasRendered || !stream.isTTY) {
      return
    }

    stream.write('\n')
  }

  function ensureStarted() {
    if (state.startedAt === null) {
      state.startedAt = now()
    }
  }

  function getSnapshot() {
    return buildSnapshot(state, now)
  }

  function logSnapshot(force = false) {
    const snapshot = getSnapshot()
    const currentBucket =
      percentStep > 0 ? Math.floor(snapshot.totalPercent / percentStep) : Number.POSITIVE_INFINITY

    if (
      !force &&
      now() - lastLoggedAt < throttleMs &&
      currentBucket <= lastLoggedBucket
    ) {
      return snapshot
    }

    lastLoggedAt = now()
    lastLoggedBucket = currentBucket
    log(formatProgressMessage(snapshot))

    return snapshot
  }

  function render(force = false) {
    if (bar) {
      return renderTTY(force)
    }

    return logSnapshot(force)
  }

  function advance(deltaBytes) {
    if (deltaBytes <= 0) {
      return getSnapshot()
    }

    ensureStarted()

    const remainingFile = Math.max(state.currentFileSize - state.currentFileBytes, 0)
    const remainingTotal = Math.max(state.totalBytes - state.totalUploadedBytes, 0)
    const safeDelta = Math.min(deltaBytes, remainingFile, remainingTotal)

    if (safeDelta <= 0) {
      return getSnapshot()
    }

    state.currentFileBytes += safeDelta
    state.totalUploadedBytes += safeDelta

    return render()
  }

  function startFile(file, fileIndex) {
    ensureStarted()
    state.currentFileBytes = 0
    state.currentFileComplete = false
    state.currentFileIndex = fileIndex
    state.currentFileName = file.name
    state.currentFileSize = file.size

    return render(true)
  }

  function completeFile() {
    const remainingBytes = Math.max(state.currentFileSize - state.currentFileBytes, 0)
    if (remainingBytes > 0) {
      advance(remainingBytes)
    }

    state.currentFileComplete = true
    return render(true)
  }

  function resetCurrentFile() {
    state.totalUploadedBytes = clamp(
      state.totalUploadedBytes - state.currentFileBytes,
      0,
      Math.max(state.totalBytes, 0),
    )
    state.currentFileBytes = 0
    state.currentFileComplete = false

    return render(true)
  }

  function finish() {
    state.finished = true

    if (bar) {
      const snapshot = renderTTY(true)
      terminateTTYRender()
      return snapshot
    }

    return logSnapshot(true)
  }

  function fail(fileName = state.currentFileName) {
    const snapshot = getSnapshot()
    if (bar) {
      renderTTY(true)
      terminateTTYRender()
    }

    log(
      `upload failed at file ${snapshot.currentFileIndex}/${snapshot.totalFiles} ` +
        `${truncateFileName(fileName || snapshot.currentFileName || '-')} ` +
        `(${formatPercent(snapshot.currentFilePercent)} current, ` +
        `${formatPercent(snapshot.totalPercent)} total, ` +
        `${snapshot.speedLabel}, eta ${snapshot.etaLabel}, ` +
        `${snapshot.transferredLabel}/${snapshot.totalLabel})`,
    )
  }

  function interrupt(message) {
    if (bar && hasRendered) {
      clearTTYRender()
      stream.write(message)
      stream.write('\n')
      renderTTY(true)
      return
    }

    log(message)
  }

  return {
    advance,
    completeFile,
    fail,
    finish,
    getSnapshot,
    interrupt,
    resetCurrentFile,
    startFile,
  }
}
