/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getSystemHostsPath from '@main/actions/getSystemHostsPath'
import * as fs from 'fs'

interface IHostsWriteOptions {

}

export default async (content: string, options?: IHostsWriteOptions) => {
  const fn = await getSystemHostsPath()

  await fs.promises.writeFile(fn, content, 'utf-8')
}
