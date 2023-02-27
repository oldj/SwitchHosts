/**
 * checkVersion
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { broadcast } from '@main/core/agent'
import { localdb } from '@main/data'
import { GET } from '@main/libs/request'
import { server_url } from '@common/constants'
import events from '@common/events'
import version from '@/version.json'
import { compareVersions } from 'compare-versions'
import { v4 as uuid4 } from 'uuid'
import * as updater from '@main/core/updater'
import type { AxiosResponse } from 'axios'

const getUniqueId = async (): Promise<string> => {
  let uid: string | undefined = await localdb.dict.local.get('uid')
  if (!uid) {
    uid = uuid4()
    await localdb.dict.local.set('uid', uid)
  }
  return uid
}

export default async (): Promise<boolean | null> => {
  let server_version = await updater.checkUpdate()
  console.log(1111, server_version)
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
