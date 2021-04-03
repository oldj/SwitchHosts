/**
 * export
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getI18N from '@main/core/getI18N'
import { swhdb } from '@main/data'
import { dialog } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'
import version from '@root/version.json'

export default async (): Promise<string | false> => {
  let { lang } = await getI18N()

  let result = await dialog.showSaveDialog({
    title: lang.import,
    defaultPath: path.join(global.last_path || '', 'swh_data.json'),
    properties: [
      'createDirectory',
      'showOverwriteConfirmation',
    ],
  })

  if (result.canceled || !result.filePath) {
    return false
  }

  let target_dir = result.filePath

  let data = await swhdb.toJSON()
  await fs.writeFile(target_dir, JSON.stringify({
    data,
    version,
  }), 'utf-8')

  return target_dir
}
