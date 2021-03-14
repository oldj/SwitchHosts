/**
 * refreshHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getHostsContent, setHostsContent, setList } from '@main/actions/index'
import { broadcast } from '@main/core/agent'

import { swhdb } from '@main/data'
import { IHostsListObject, IOperationResult } from '@root/common/data'
import * as hostsFn from '@root/common/hostsFn'
import version from '@root/version.json'
import axios from 'axios'
import dayjs from 'dayjs'

export default async (hosts_id: string): Promise<IOperationResult> => {
  let list = await swhdb.list.tree.all()
  let hosts: IHostsListObject | undefined = hostsFn.findItemById(list, hosts_id)

  if (!hosts) {
    return {
      success: false,
      code: 'invalid_id',
    }
  }

  let { where, url } = hosts

  if (where !== 'remote') {
    return {
      success: false,
      code: 'not_remote',
    }
  }

  if (!url) {
    return {
      success: false,
      code: 'no_url',
    }
  }

  let old_content: string = await getHostsContent(hosts.id)
  let new_content: string
  try {
    console.log(`-> refreshHosts URL: "${url}"`)
    let resp = await axios.get(url, {
      headers: {
        'User-Agent': `SwitchHosts/${version.join('.')}`,
      },
    })
    new_content = resp.data
  } catch (e) {
    console.error(e)
    return {
      success: false,
      message: e.message,
    }
  }

  hosts.last_refresh = dayjs().format('YYYY-MM-DD HH:mm:ss')
  hosts.last_refresh_ms = (new Date()).getTime()

  await setList(list)

  if (old_content !== new_content) {
    await setHostsContent(hosts_id, new_content)
    broadcast('hosts_refreshed', hosts)
    broadcast('hosts_content_changed', hosts_id)
  }

  return {
    success: true,
    data: { ...hosts },
  }
}
