/**
 * db
 * @author: oldj
 * @homepage: https://oldj.net
 */

import getDataFolder from '@main/libs/getDataFolder'
import { app } from 'electron'
import * as path from 'path'
import PotDb from 'potdb'

let swhdb: PotDb
let cfgdb: PotDb
let localdb: PotDb

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

if (!global.localdb) {
  let db_dir: string = path.join(app.getPath('userData'), 'swh_local')
  localdb = new PotDb(db_dir)
  console.log(`local db: ${localdb.dir}`)
  global.localdb = localdb
} else {
  localdb = global.localdb
}

export {
  swhdb,
  cfgdb,
  localdb,
}
