/**
 * checkIfMigration
 * check if migration is required
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getDataFolder from '@main/libs/getDataDir'
import { isDir } from '@main/utils/fs2'
import * as fs from 'fs'
import * as path from 'path'

export default async (): Promise<boolean> => {
  let dir = getDataFolder()
  let old_data_file = path.join(dir, 'data.json')
  let new_data_dir = path.join(dir, 'data')
  let has_new_data =
    isDir(new_data_dir) && isDir(path.join(new_data_dir, 'collection'))

  return fs.existsSync(old_data_file) && !has_new_data
}
