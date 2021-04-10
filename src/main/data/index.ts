/**
 * db
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getDataFolder from '@main/libs/getDataFolder'
import PotDb from 'potdb'
import * as path from 'path'

let swhdb: PotDb
let cfgdb: PotDb

if (!global.swhdb) {
  let db_dir: string = path.join(getDataFolder(), 'data')
  swhdb = new PotDb(db_dir)
  console.log(`data db: ${swhdb.dir}`)
  global.swhdb = swhdb
} else {
  swhdb = global.swhdb
}

if (!global.cfgdb) {
  let db_dir: string = path.join(getDataFolder(), 'config')
  cfgdb = new PotDb(db_dir)
  console.log(`config db: ${cfgdb.dir}`)
  global.cfgdb = cfgdb
} else {
  cfgdb = global.cfgdb
}

export {
  swhdb,
  cfgdb,
}
