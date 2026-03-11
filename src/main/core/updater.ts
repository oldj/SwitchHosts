import events from '@common/events'
import { AppDownloadedUpdateInfo, AppUpdateInfo, AppUpdateProgress } from '@common/update'
import { broadcast } from '@main/core/agent'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'

let isBound = false
let currentUpdateInfo: AppUpdateInfo | null = null
let downloadedUpdateInfo: AppDownloadedUpdateInfo | null = null

function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | null {
  if (!releaseNotes) {
    return null
  }

  if (typeof releaseNotes === 'string') {
    return releaseNotes
  }

  return releaseNotes
    .map((item) => {
      if (!item.note) {
        return ''
      }

      if (!item.version) {
        return item.note
      }

      return `## ${item.version}\n${item.note}`
    })
    .filter(Boolean)
    .join('\n\n')
}

function toAppUpdateInfo(info: UpdateInfo): AppUpdateInfo {
  return {
    version: info.version,
    releaseName: info.releaseName || null,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
  }
}

function toProgressPayload(info: ProgressInfo): AppUpdateProgress {
  return {
    percent: info.percent,
    transferred: info.transferred,
    total: info.total,
    bytesPerSecond: info.bytesPerSecond,
  }
}

function toDownloadedUpdateInfo(event: UpdateDownloadedEvent): AppDownloadedUpdateInfo {
  return {
    ...(currentUpdateInfo || toAppUpdateInfo(event)),
    downloadedFile: event.downloadedFile || null,
  }
}

function bindUpdaterEvents() {
  if (isBound) {
    return
  }

  // Bind lazily so test environments that stub Electron do not initialize
  // the updater before an explicit update action is requested.
  isBound = true
  autoUpdater.autoDownload = false
  autoUpdater.allowPrerelease = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    currentUpdateInfo = toAppUpdateInfo(info)
    downloadedUpdateInfo = null
    console.log('update-available', currentUpdateInfo)
    broadcast(events.new_version, currentUpdateInfo)
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('update-not-available', info)
    currentUpdateInfo = null
    downloadedUpdateInfo = null
  })

  autoUpdater.on('download-progress', (info) => {
    const payload = toProgressPayload(info)
    console.log('download-progress', payload)
    broadcast(events.update_download_progress, payload)
  })

  autoUpdater.on('update-downloaded', (event) => {
    downloadedUpdateInfo = toDownloadedUpdateInfo(event)
    console.log('update-downloaded', downloadedUpdateInfo)
    broadcast(events.update_downloaded, downloadedUpdateInfo)
  })

  autoUpdater.on('error', (error, message) => {
    console.error('autoUpdater error', message || '', error)
  })
}

export async function checkUpdate(): Promise<AppUpdateInfo | null> {
  bindUpdaterEvents()
  const result = await autoUpdater.checkForUpdates()
  console.log('updater checkForUpdates', result)

  if (!result?.isUpdateAvailable) {
    currentUpdateInfo = null
    downloadedUpdateInfo = null
    return null
  }

  // Normalize the updater payload so renderer code does not depend on
  // electron-updater's version-specific event shape.
  currentUpdateInfo = toAppUpdateInfo(result.updateInfo)
  return currentUpdateInfo
}

export async function downloadUpdate() {
  bindUpdaterEvents()

  if (!currentUpdateInfo) {
    throw new Error('No update is available to download.')
  }

  downloadedUpdateInfo = null
  return autoUpdater.downloadUpdate()
}

export async function installUpdate() {
  bindUpdaterEvents()

  if (!downloadedUpdateInfo) {
    throw new Error('No downloaded update is ready to install.')
  }

  global.is_will_quit = true
  autoUpdater.quitAndInstall()
}
