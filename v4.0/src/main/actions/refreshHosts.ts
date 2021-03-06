/**
 * refreshHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { localContentSet, localListSet } from '@main/actions/index'

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

  let content: string
  try {
    console.log(`-> refreshHosts URL: "${url}"`)
    let resp = await axios.get(url, {
      headers: {
        'User-Agent': `SwitchHosts/${version.join('.')}`,
      },
    })
    content = resp.data
  } catch (e) {
    console.error(e)
    return {
      success: false,
      message: e.message,
    }
  }

  hosts.last_refresh = dayjs().format('YYYY-MM-DD HH:mm:ss')

  await localContentSet(hosts_id, content)
  await localListSet(list)

  return {
    success: true,
    data: { ...hosts },
  }
}
