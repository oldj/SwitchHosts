/**
 * showItemInFolder
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { isDir } from '@main/utils/fs2'
import { shell } from 'electron'

export default async (link: string) => {
  if (isDir(link)) {
    await shell.openPath(link)
    return
  }

  await shell.showItemInFolder(link)
}
