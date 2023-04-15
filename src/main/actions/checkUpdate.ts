/**
 * checkVersion
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { broadcast } from '@main/core/agent'
import events from '@common/events'
import version from '@/version.json'
import { compareVersions } from 'compare-versions'
import * as updater from '@main/core/updater'

export default async (): Promise<boolean | null> => {
  let server_version = await updater.checkUpdate()
  if (!server_version) {
    return false
  }

  let local_version = version.slice(0, 3).join('.')

  if (compareVersions(server_version, local_version) === 1) {
    // new version found
    console.log(`new version: ${server_version}`)
    broadcast(events.new_version, server_version)
    // 有更新
    return true
  }

  // 没有更新
  return false
}
