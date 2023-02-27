/**
 * cron
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { checkUpdate, configGet, getList, refreshHosts } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { flatten } from '@common/hostsFn'

let t: any
let ts_last_server_check = 0

const isNeedRefresh = (hosts: IHostsListObject): boolean => {
  let { refresh_interval, last_refresh_ms, url } = hosts

  if (!refresh_interval || refresh_interval <= 0) return false
  if (!url || !url.match(/^https?:\/\//i)) return false

  if (!last_refresh_ms) return true

  let ts = new Date().getTime()
  if ((ts - last_refresh_ms) / 1000 >= refresh_interval) {
    return true
  }

  // false
  return false
}

const checkRefresh = async () => {
  // console.log('check refresh...')
  let list = await getList()
  let remote_hosts = flatten(list).filter((h) => h.type === 'remote')

  for (let hosts of remote_hosts) {
    if (isNeedRefresh(hosts)) {
      try {
        await refreshHosts(hosts.id)
      } catch (e) {
        console.error(e)
      }
    }
  }

  broadcast(events.reload_list)
}

const checkServer = async () => {
  let auto_download_update = await configGet('auto_download_update')
  if (!auto_download_update) return

  let ts = new Date().getTime()
  if (!ts_last_server_check || ts - ts_last_server_check > 3600 * 1000) {
    await checkUpdate()
    ts_last_server_check = ts
  }
}

const check = async () => {
  checkRefresh().catch((e) => console.error(e))

  checkServer().catch((e) => console.error(e))

  global.tracer.emit().catch((e) => console.error(e))
}

export const start = () => {
  setTimeout(checkServer, 5000)

  clearInterval(t)
  t = setInterval(check, 60 * 1000)
}
