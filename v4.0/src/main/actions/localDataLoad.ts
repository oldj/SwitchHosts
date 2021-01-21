/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsDataType } from '@root/common/data'
import * as path from 'path'
import * as fs from 'fs'
import getDataFolder from '@main/actions/getDataFolder'

export default async (): Promise<HostsDataType> => {
  const fn = path.join(await getDataFolder(), 'data.json')

  if (!fs.existsSync(fn)) {
    return {}
  }

  let content = await fs.promises.readFile(fn, 'utf-8')
  try {
    return JSON.parse(content) as HostsDataType
  } catch (e) {
    console.error(e)
    return {}
  }
}
