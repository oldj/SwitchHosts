/**
 * import
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getI18N from '@main/core/getI18N'
import { swhdb } from '@main/data'
import { dialog } from 'electron'
import { promises as fs } from 'fs'

export default async (): Promise<boolean | string> => {
  let { lang } = await getI18N()

  let result = await dialog.showOpenDialog({
    title: lang.import,
    defaultPath: global.last_path,
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: [
      'openFile',
    ],
  })

  if (result.canceled) {
    return false
  }

  let paths = result.filePaths
  let fn = paths[0]
  let content = await fs.readFile(fn, 'utf-8')

  let data: any
  try {
    data = JSON.parse(content)
  } catch (e) {
    console.error(e)
    return 'parse_error'
  }

  if (typeof data !== 'object' || !data.version || !Array.isArray(data.version) || !data.data) {
    return 'invalid_data'
  }

  let { version } = data
  if (version[0] === 3) {
    // import v3 data
  }
  if (version[0] > 4) {
    return 'new_version'
  }

  await swhdb.loadJSON(data.data)

  return true
}
