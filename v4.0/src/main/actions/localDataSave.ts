/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getDataFolder from '@main/actions/getDataFolder'
import { HostsDataType } from '@root/common/data'
import * as fs from 'fs'
import * as path from 'path'

export default async (data: HostsDataType) => {
  const fn = path.join(await getDataFolder(), 'data.json')
  await fs.promises.writeFile(fn, JSON.stringify(data, null, 2), 'utf-8')
}
