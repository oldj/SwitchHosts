/**
 * db
 * @author: oldj
 * @homepage: https://oldj.net
 */

import SwhDb from '@main/libs/db'
import * as os from 'os'
import * as path from 'path'

let swhdb: SwhDb

if (!global.swhdb) {
  let db_dir: string = path.join(os.homedir(), '.SwitchHosts', 'data')
  swhdb = new SwhDb(db_dir)
  console.log(`db: ${swhdb.dir}`)
  global.swhdb = swhdb
}

export {
  swhdb,
}
