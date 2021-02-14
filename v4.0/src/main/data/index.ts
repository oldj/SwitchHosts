/**
 * db
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getDataFolder from '@main/libs/getDataFolder'
import SwhDb from '@main/utils/db'
import * as path from 'path'

let swhdb: SwhDb

if (!global.swhdb) {
  let db_dir: string = path.join(getDataFolder(), 'data')
  swhdb = new SwhDb(db_dir)
  console.log(`db: ${swhdb.dir}`)
  global.swhdb = swhdb
} else {
  swhdb = global.swhdb
}

export {
  swhdb,
}
