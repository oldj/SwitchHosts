import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface V5Paths {
  root: string
  manifestFile: string
  trashcanFile: string
  entriesDir: string
  internalDir: string
  configFile: string
  stateFile: string
  historiesDir: string
}

export function resolveDefaultPaths(): V5Paths {
  return under(path.join(os.homedir(), '.SwitchHosts'))
}

export function under(root: string): V5Paths {
  const internal = path.join(root, 'internal')
  return {
    root,
    manifestFile: path.join(root, 'manifest.json'),
    trashcanFile: path.join(root, 'trashcan.json'),
    entriesDir: path.join(root, 'entries'),
    internalDir: internal,
    configFile: path.join(internal, 'config.json'),
    stateFile: path.join(internal, 'state.json'),
    historiesDir: path.join(internal, 'histories'),
  }
}

export function ensureDirs(paths: V5Paths): void {
  fs.mkdirSync(paths.entriesDir, { recursive: true })
  fs.mkdirSync(paths.internalDir, { recursive: true })
  fs.mkdirSync(paths.historiesDir, { recursive: true })
}

export function atomicWrite(filePath: string, data: Buffer | string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, filePath)
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function systemHostsPath(): string {
  if (process.platform === 'win32') {
    const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
    return path.join(windir, 'System32', 'drivers', 'etc', 'hosts')
  }
  return '/etc/hosts'
}

export const CONTENT_START_MARKER = '# --- SWITCHHOSTS_CONTENT_START ---'

export function normalizeToLf(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function restoreLineEndings(contentLf: string): string {
  const ending = process.platform === 'win32' ? '\r\n' : '\n'
  return contentLf.split('\n').join(ending)
}

export function makeAppendContent(previousLf: string, newContentLf: string): string {
  const markerIndex = previousLf.indexOf(CONTENT_START_MARKER)
  const base =
    markerIndex >= 0 ? previousLf.slice(0, markerIndex).replace(/\n+$/, '') : previousLf.replace(/\n+$/, '')
  const parts = [base, CONTENT_START_MARKER, newContentLf.replace(/^\n+/, '')].filter(Boolean)
  return parts.join('\n') + '\n'
}
