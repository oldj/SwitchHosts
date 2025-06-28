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
import _ from 'lodash'
import { IHostsContentObject, IHostsListObject } from '../../../common/data'

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

  let data: { hosts: IHostsContentObject[], tree: IHostsListObject[] };
  try {
    data = JSON.parse(content)
  } catch (e) {
    console.error(e)
    return 'parse_error'
  }

  await swhdb.collection.hosts.rebuildIndexes();
  for (const item of data.hosts) {
    await swhdb.collection.hosts.insert(item);
  }

  for (const item of data.tree) {
    await swhdb.list.tree.push(item);
  }

  return true
}
