export type LineEnding = '\n' | '\r\n'

const LINE_ENDING_RE = /\r\n?/g

export function normalizeLineEndings(content: string): string {
  return content.replace(LINE_ENDING_RE, '\n')
}

export function getLineEndingForPlatform(platform = process.platform): LineEnding {
  if (platform === 'win32') {
    return '\r\n'
  }

  return '\n'
}

export function restoreLineEndings(content: string, lineEnding: LineEnding): string {
  const normalized = normalizeLineEndings(content)

  if (lineEnding === '\r\n') {
    return normalized.replace(/\n/g, '\r\n')
  }

  return normalized
}
