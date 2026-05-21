import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'

import {
  ensureDirs,
  makeAppendContent,
  normalizeToLf,
  readJsonFile,
  restoreLineEndings,
  systemHostsPath,
  atomicWrite,
  type V5Paths,
} from './paths'
import { loadConfig } from './config'
import {
  collectContentIds,
  loadManifest,
  loadTrashcan,
  readEntry,
  saveManifest,
  saveTrashcan,
  writeEntry,
  type JsonNode,
  type TrashcanItem,
} from './manifest'

export interface ApplyResult {
  success: boolean
  code?: string
  message?: string
}

function hashContent(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) | 0
  }
  return String(hash)
}

function readSystemHosts(): string {
  const target = systemHostsPath()
  if (!fs.existsSync(target)) return ''
  return fs.readFileSync(target, 'utf8')
}

function writeSystemHostsDirect(content: string): void {
  fs.writeFileSync(systemHostsPath(), content, 'utf8')
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function writeSystemHostsElevated(content: string): void {
  const tmp = path.join(os.tmpdir(), `swh_apply_${process.pid}.hosts`)
  fs.writeFileSync(tmp, content, 'utf8')
  const target = systemHostsPath()
  if (process.platform === 'darwin') {
    const script = `do shell script "cat ${shellQuote(tmp)} > ${shellQuote(target)}" with administrator privileges`
    execFileSync('osascript', ['-e', script], { stdio: 'pipe' })
  } else if (process.platform === 'win32') {
    throw new Error('Windows elevation is not implemented in the VS Code extension yet')
  } else {
    execFileSync('pkexec', ['sh', '-c', `cat ${shellQuote(tmp)} > ${shellQuote(target)}`], {
      stdio: 'pipe',
    })
  }
  fs.unlinkSync(tmp)
}

export function applyHostsSelection(paths: V5Paths, content: string): ApplyResult {
  const config = loadConfig(paths.configFile)
  const writeMode = String(config.write_mode ?? 'append')
  const contentLf = normalizeToLf(content)
  const previousRaw = readSystemHosts()
  const previousLf = normalizeToLf(previousRaw)
  const finalLf = writeMode === 'append' ? makeAppendContent(previousLf, contentLf) : contentLf
  const diskContent = restoreLineEndings(finalLf)

  if (hashContent(previousRaw) === hashContent(diskContent)) {
    return { success: true, code: 'success' }
  }

  try {
    writeSystemHostsDirect(diskContent)
    return { success: true, code: 'success' }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'EACCES' && err.code !== 'EPERM') {
      return { success: false, code: 'fail', message: String(err.message ?? err) }
    }
    try {
      writeSystemHostsElevated(diskContent)
      return { success: true, code: 'success' }
    } catch (elevatedError) {
      return {
        success: false,
        code: 'fail',
        message: `Permission denied writing ${systemHostsPath()}: ${elevatedError}`,
      }
    }
  }
}

export function exportBackup(paths: V5Paths, dest: string): void {
  ensureDirs(paths)
  const manifest = loadManifest(paths)
  const trashcan = loadTrashcan(paths.trashcanFile)
  const ids = collectContentIds(manifest.root)
  const entries: Record<string, string> = {}
  for (const id of ids) {
    if (id === '0') continue
    entries[id] = readEntry(paths.entriesDir, id)
  }
  const backup = {
    format: 'switchhosts-backup',
    schemaVersion: 1,
    version: [5, 0, 0, 0],
    exportedAt: new Date().toISOString(),
    manifest: {
      format: 'switchhosts-data',
      schemaVersion: 1,
      root: manifest.root,
    },
    entries,
    trashcan: {
      format: 'switchhosts-trashcan',
      schemaVersion: 1,
      items: trashcan,
    },
  }
  atomicWrite(dest, JSON.stringify(backup, null, 2))
}

export function importBackup(paths: V5Paths, bytes: Buffer): string | true {
  ensureDirs(paths)
  let data: Record<string, unknown>
  try {
    data = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
  } catch {
    return 'parse_error'
  }
  if (data.format !== 'switchhosts-backup') {
    return 'invalid_data'
  }
  const manifestObj = data.manifest as { root?: JsonNode[] } | undefined
  if (!manifestObj?.root) {
    return 'invalid_data'
  }
  const entries = (data.entries as Record<string, string> | undefined) ?? {}
  for (const [id, content] of Object.entries(entries)) {
    if (id === '0') continue
    writeEntry(paths.entriesDir, id, content)
  }
  const trashcanItems = ((data.trashcan as { items?: TrashcanItem[] } | undefined)?.items ??
    []) as TrashcanItem[]
  saveTrashcan(paths.trashcanFile, trashcanItems)
  saveManifest(paths, { root: manifestObj.root })
  return true
}

export function loadApplyHistory(paths: V5Paths): unknown[] {
  return readJsonFile<unknown[]>(path.join(paths.historiesDir, 'system-hosts.json'), [])
}

export function saveApplyHistory(paths: V5Paths, items: unknown[]): void {
  atomicWrite(path.join(paths.historiesDir, 'system-hosts.json'), JSON.stringify(items, null, 2))
}
