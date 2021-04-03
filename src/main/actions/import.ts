/**
 * import
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { dialog } from 'electron'
import getI18N from '@main/core/getI18N'

export default async () => {
  let { lang } = await getI18N()

  let result = await dialog.showOpenDialog({
    title: lang.import,
    defaultPath: global.last_path,
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: [
      'openDirectory',
    ],
  })

  if (result.canceled) {
    return false
  }

  let paths = result.filePaths
  console.log(paths)
}
