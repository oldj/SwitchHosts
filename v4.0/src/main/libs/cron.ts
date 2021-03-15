/**
 * cron
 * @author: oldj
 * @homepage: https://oldj.net
 */
import { getList, refreshHosts } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { IHostsListObject } from '@root/common/data'
import { flatten } from '@root/common/hostsFn'

let t: any

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

const check = async () => {
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

export const start = () => {
  clearInterval(t)
  t = setInterval(check, 60 * 1000)
}
