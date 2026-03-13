import { describe, expect, it } from 'vitest'
import {
  createUploadProgressTracker,
  formatEta,
  formatProgressMessage,
  formatTtyProgressLines,
  fitFileNameToWidth,
  truncateFileName,
} from '../../scripts/upload-progress.mjs'

describe('upload progress tracker', () => {
  it('aggregates total files and bytes across multiple uploads', () => {
    let currentTime = 0
    const tracker = createUploadProgressTracker({
      isTTY: false,
      log() {},
      now: () => currentTime,
      totalBytes: 400,
      totalFiles: 2,
    })

    tracker.startFile({ name: 'first.zip', size: 100 }, 1)
    currentTime = 1000
    tracker.advance(100)
    tracker.completeFile()

    tracker.startFile({ name: 'second.zip', size: 300 }, 2)
    currentTime = 2000
    tracker.advance(60)

    const snapshot = tracker.getSnapshot()

    expect(snapshot.currentFileIndex).toBe(2)
    expect(snapshot.totalFiles).toBe(2)
    expect(snapshot.totalBytes).toBe(400)
    expect(snapshot.totalUploadedBytes).toBe(160)
    expect(snapshot.currentFileBytes).toBe(60)
    expect(snapshot.totalPercent).toBeCloseTo(40)
    expect(snapshot.currentFilePercent).toBeCloseTo(20)
    expect(snapshot.speedBytesPerSecond).toBeCloseTo(80)
  })

  it('reports a safe eta before any bytes are uploaded', () => {
    const tracker = createUploadProgressTracker({
      isTTY: false,
      log() {},
      now: () => 0,
      totalBytes: 200,
      totalFiles: 1,
    })

    tracker.startFile({ name: 'asset.zip', size: 200 }, 1)

    expect(tracker.getSnapshot().etaSeconds).toBeNull()
    expect(formatEta(tracker.getSnapshot().etaSeconds)).toBe('--:--')
  })

  it('reaches 100 percent after the last chunk and finish', () => {
    let currentTime = 0
    const tracker = createUploadProgressTracker({
      isTTY: false,
      log() {},
      now: () => currentTime,
      totalBytes: 120,
      totalFiles: 1,
    })

    tracker.startFile({ name: 'asset.zip', size: 120 }, 1)
    currentTime = 1000
    tracker.advance(120)
    tracker.completeFile()
    tracker.finish()

    const snapshot = tracker.getSnapshot()

    expect(snapshot.totalUploadedBytes).toBe(120)
    expect(snapshot.totalPercent).toBe(100)
    expect(snapshot.currentFilePercent).toBe(100)
    expect(snapshot.etaSeconds).toBe(0)
  })

  it('can roll back the current file progress before a retry', () => {
    let currentTime = 0
    const tracker = createUploadProgressTracker({
      isTTY: false,
      log() {},
      now: () => currentTime,
      totalBytes: 400,
      totalFiles: 2,
    })

    tracker.startFile({ name: 'first.zip', size: 100 }, 1)
    currentTime = 1000
    tracker.advance(100)
    tracker.completeFile()

    tracker.startFile({ name: 'second.zip', size: 300 }, 2)
    currentTime = 2000
    tracker.advance(120)
    tracker.resetCurrentFile()

    const snapshot = tracker.getSnapshot()

    expect(snapshot.totalUploadedBytes).toBe(100)
    expect(snapshot.currentFileBytes).toBe(0)
    expect(snapshot.totalPercent).toBeCloseTo(25)
    expect(snapshot.currentFilePercent).toBe(0)
  })

  it('throttles non-tty progress logs instead of logging every chunk', () => {
    let currentTime = 0
    const logs: string[] = []
    const tracker = createUploadProgressTracker({
      isTTY: false,
      log(message) {
        logs.push(message)
      },
      now: () => currentTime,
      percentStep: 5,
      throttleMs: 1000,
      totalBytes: 1000,
      totalFiles: 1,
    })

    tracker.startFile({ name: 'asset.zip', size: 1000 }, 1)
    currentTime = 100
    tracker.advance(10)
    currentTime = 200
    tracker.advance(20)
    currentTime = 300
    tracker.advance(30)

    expect(logs).toHaveLength(2)
    expect(logs[0]).toContain('file 1/1')
    expect(logs[1]).toContain('progress 6.0%')
  })

  it('interrupts an active tty progress bar before printing status messages', () => {
    const logs: string[] = []
    const writes: string[] = []
    class FakeProgressBar {
      complete = false
      curr = 0
      total = 100

      interrupt(message: string) {
        writes.push(`interrupt:${message}`)
      }

      render() {}

      terminate() {}

      tick(delta: number) {
        this.curr += delta
      }

      update(ratio: number) {
        this.curr = Math.floor(this.total * ratio)
      }
    }

    const fakeStream = {
      clearLine() {},
      cursorTo() {},
      isTTY: true,
      moveCursor() {},
      write(chunk: string) {
        writes.push(chunk)
        return true
      },
    }

    const tracker = createUploadProgressTracker({
      ProgressBarClass: FakeProgressBar as never,
      isTTY: true,
      log(message) {
        logs.push(message)
      },
      stream: fakeStream as never,
      totalBytes: 100,
      totalFiles: 1,
    })

    tracker.startFile({ name: 'asset.zip', size: 100 }, 1)
    tracker.interrupt('[release:upload] replacing existing asset asset.zip')

    expect(logs).toEqual([])
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.join('')).toContain('[release:upload] replacing existing asset asset.zip')
  })

  it('truncates long file names while keeping the suffix visible', () => {
    const fileName = 'SwitchHosts-macos-universal-v4.2.0.12345-very-long-artifact-name.zip'
    const truncated = truncateFileName(fileName, 36)

    expect(truncated).toHaveLength(36)
    expect(truncated).toContain('...')
    expect(truncated.endsWith('ifact-name.zip')).toBe(true)
    expect(
      formatProgressMessage({
        currentFileIndex: 1,
        currentFilePercent: 12.34,
        currentFileSize: 10,
        currentFileBytes: 1,
        currentFileName: fileName,
        displayFileName: truncated,
        etaLabel: '00:12',
        etaSeconds: 12,
        speedBytesPerSecond: 10,
        speedLabel: '10 B/s',
        totalBytes: 100,
        totalFiles: 2,
        totalPercent: 45.67,
        totalUploadedBytes: 46,
        totalLabel: '100 B',
        transferredLabel: '46 B',
      }),
    ).toContain(truncated)
  })

  it('shows the full file name in tty output when there is enough space', () => {
    const fileName = 'SwitchHosts-v4.3.0.6136-linux-amd64.deb'
    const lines = formatTtyProgressLines(
      {
        currentFileIndex: 5,
        currentFilePercent: 30.4,
        currentFileSize: 100,
        currentFileBytes: 30,
        currentFileName: fileName,
        displayFileName: fileName,
        etaLabel: '02:21:58',
        etaSeconds: 8518,
        speedBytesPerSecond: 175000,
        speedLabel: '175 kB/s',
        totalBytes: 1520000000,
        totalFiles: 24,
        totalPercent: 1.9,
        totalUploadedBytes: 28100000,
        totalLabel: '1.52 GB',
        transferredLabel: '28.1 MB',
      },
      '[                        ]',
      140,
    )

    expect(lines[1]).toContain(fileName)
  })

  it('truncates the tty file name only when the line is too narrow', () => {
    const fileName = 'SwitchHosts-v4.3.0.6136-linux-amd64.deb'

    expect(fitFileNameToWidth(fileName, 100)).toBe(fileName)
    expect(fitFileNameToWidth(fileName, 20)).toContain('...')
  })
})
