/**
 * cron
 * @author: oldj
 * @homepage: https://oldj.net
 */
import { getList, refreshHosts } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { GET } from '@main/libs/request'
import { server_url } from '@root/common/constants'
import { IHostsListObject } from '@root/common/data'
import { flatten } from '@root/common/hostsFn'

let t: any
let ts_last_server_check = 0

const isNeedRefresh = (hosts: IHostsListObject): boolean => {
  let { refresh_interval, last_refresh_ms, url } = hosts

  if (!refresh_interval || refresh_interval <= 0) return false
  if (!url || !url.match(/^https?:\/\//i)) return false

  if (!last_refresh_ms) return true

  let ts = (new Date()).getTime()
  if ((ts - last_refresh_ms) / 1000 >= refresh_interval) {
    return true
  }

  // false
  return false
}

const checkRefresh = async () => {
  // console.log('check refresh...')
  let list = await getList()
  let remote_hosts = flatten(list)
    .filter(h => h.type === 'remote')

  for (let hosts of remote_hosts) {
    if (isNeedRefresh(hosts)) {
      try {
        await refreshHosts(hosts.id)
      } catch (e) {
        console.error(e)
      }
    }
  }

  broadcast('reload_list')
}

const checkServer = async () => {
  // Only used for anonymous statistics of DAU, no personal information will be sent
  await GET(`${server_url}/api/check/`)
}

const check = async () => {
  checkRefresh()
    .catch(e => console.error(e))

  let ts = (new Date()).getTime()
  if (!ts_last_server_check || (ts - ts_last_server_check) > 3600 * 1000) {
    checkServer()
      .catch(e => console.error(e))
    ts_last_server_check = ts
  }
}

export const start = () => {
  setTimeout(checkServer, 5000)

  clearInterval(t)
  t = setInterval(check, 60 * 1000)
}
