/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getDataFolder from '@main/actions/getDataFolder'
import { HostsDataType } from '@root/common/data'
import version from '@root/version.json'
import * as fs from 'fs'
import * as path from 'path'

export default async (): Promise<HostsDataType> => {
  const fn = path.join(await getDataFolder(), 'data.json')
  const default_data: HostsDataType = {
    list: [],
    version,
  }

  if (!fs.existsSync(fn)) {
    return default_data
  }

  let content = await fs.promises.readFile(fn, 'utf-8')
  try {
    return JSON.parse(content) as HostsDataType
  } catch (e) {
    console.error(e)
    return default_data
  }
}
