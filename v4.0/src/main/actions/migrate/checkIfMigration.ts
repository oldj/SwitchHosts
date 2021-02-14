/**
 * checkIfMigration
 * check if migration is required
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { isDir } from '@main/utils/fs2'
import * as fs from 'fs'
import * as path from 'path'
import getDataFolder from '@main/libs/getDataFolder'

export default async (): Promise<boolean> => {
  let dir = getDataFolder()
  let old_data_file = path.join(dir, 'data.json')
  let new_data_dir = path.join(dir, 'data')

  return !(!fs.existsSync(old_data_file) || isDir(new_data_dir))
}
