/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getPathOfSystemHosts from './getPathOfSystemHostsPath'
import * as fs from 'fs'

export default async (): Promise<string> => {
  const fn = await getPathOfSystemHosts()

  if (!fs.existsSync(fn)) {
    return ''
  }

  return await fs.promises.readFile(fn, 'utf-8')
}
