/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { app, dialog } from 'electron'
import { localdb } from '@main/data'
import getDataFolder from '@main/libs/getDataDir'
import getI18N from '@main/core/getI18N'

export default async (): Promise<string | undefined> => {
  let { lang } = await getI18N()
  let current_dir = getDataFolder()

  let r = await dialog.showOpenDialog({
    title: '选择数据目录',
    defaultPath: current_dir,
    properties: ['openDirectory', 'createDirectory'],
  })

  if (r.canceled) {
    return
  }

  let dir = r.filePaths[0]
  if (!dir || dir === current_dir) {
    return
  }

  await localdb.dict.local.set('data_dir', dir)
  dialog.showMessageBoxSync({
    message: lang.need_to_relaunch_after_setting_changed,
  })
  app.relaunch()
  app.exit(0)

  return dir
}
