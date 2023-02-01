/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { app, BrowserWindow, dialog, OpenDialogOptions, OpenDialogReturnValue } from 'electron'
import { localdb } from '@main/data'
import getDataFolder, { getDefaultDataDir } from '@main/libs/getDataDir'
import getI18N from '@main/core/getI18N'
import { IActionFunc } from '@common/types'

export default async function (
  this: IActionFunc,
  to_default?: boolean,
): Promise<string | undefined> {
  let { sender } = this
  let { lang } = await getI18N()
  let current_dir = getDataFolder()
  let dir: string = ''

  if (to_default) {
    dir = getDefaultDataDir()
  } else {
    let parent = BrowserWindow.fromWebContents(sender)
    if (parent?.isFullScreen()) {
      parent?.setFullScreen(false)
    }

    let options: OpenDialogOptions = {
      // title: '选择数据目录',
      defaultPath: current_dir,
      properties: ['openDirectory', 'createDirectory'],
    }

    let r: OpenDialogReturnValue

    if (parent) {
      r = await dialog.showOpenDialog(parent, options)
    } else {
      r = await dialog.showOpenDialog(options)
    }

    if (r.canceled) {
      return
    }

    dir = r.filePaths[0]
  }

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
