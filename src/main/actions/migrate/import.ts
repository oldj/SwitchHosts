/**
 * import
 * @author: oldj
 * @homepage: https://oldj.net
 */

import importV3Data from '@main/actions/migrate/importV3Data'
import getI18N from '@main/core/getI18N'
import { swhdb } from '@main/data'
import { dialog } from 'electron'
import { promises as fs } from 'fs'

export default async (): Promise<boolean | null | string> => {
  let { lang } = await getI18N()

  let result = await dialog.showOpenDialog({
    title: lang.import,
    defaultPath: global.last_path,
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })

  if (result.canceled) {
    return null
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

  if (
    typeof data !== 'object' ||
    !data.version ||
    !Array.isArray(data.version)
  ) {
    return 'invalid_data'
  }

  let { version } = data
  if (version[0] === 3) {
    // import v3 data
    try {
      await importV3Data(data)
    } catch (e) {
      console.error(e)
      return 'invalid_v3_data'
    }

    return true
  }

  if (version[0] > 4) {
    return 'new_version'
  }

  if (!data.data || typeof data.data !== 'object') {
    return 'invalid_data_key'
  }

  await swhdb.loadJSON(data.data)

  return true
}
