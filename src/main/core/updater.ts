/**
 * updater.ts
 */

import events from '@common/events'
import { broadcast } from '@main/core/agent'
import { autoUpdater, ProgressInfo } from 'electron-updater'

export async function checkUpdate(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    autoUpdater.autoDownload = true

    autoUpdater
      .checkForUpdatesAndNotify()
      .then((check_result) => {
        console.log('updater checkForUpdates', check_result)
      })
      .catch((e) => {
        console.error(e)
        reject(e)
      })

    autoUpdater.on('update-available', (info) => {
      console.log('update-available', info)
      resolve(info.version)
    })

    autoUpdater.on('update-not-available', (info) => {
      console.log('update-not-available', info)
      // resolve(info.version)
      resolve(null)
    })

    autoUpdater.on('download-progress', (info: ProgressInfo) => {
      console.log('download-progress')
      console.log(info)
      broadcast(events.update_download_progress, info)
    })

    autoUpdater.on('update-downloaded', async (e) => {
      console.log('update-downloaded')
      broadcast(events.update_downloaded, e.version)
    })
  })
}

export async function quiteAndInstall() {
  global.is_will_quit = true
  autoUpdater.quitAndInstall()
}
