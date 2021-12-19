/**
 * db
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as path from 'path'
import PotDb from 'potdb'
import { app } from 'electron'
import getDataFolder from '@main/libs/getDataDir'
import getConfigFolder from '@main/libs/getConfigDir'

let localdb: PotDb
let cfgdb: PotDb
let swhdb: PotDb

if (!global.localdb) {
  let db_dir: string = path.join(app.getPath('userData'), 'swh_local')
  localdb = new PotDb(db_dir)
  console.log(`local db: ${localdb.dir}`)
  global.localdb = localdb
} else {
  localdb = global.localdb
}

if (!global.cfgdb) {
  let db_dir: string = path.join(getConfigFolder(), 'config')
  cfgdb = new PotDb(db_dir)
  console.log(`config db: ${cfgdb.dir}`)
  global.cfgdb = cfgdb
} else {
  cfgdb = global.cfgdb
}

async function getSwhDb(): Promise<PotDb> {
  if (!swhdb) {
    global.data_dir = await localdb.dict.local.get('data_dir')
    let db_dir: string = path.join(getDataFolder(), 'data')
    swhdb = new PotDb(db_dir)
    console.log(`data db: ${swhdb.dir}`)
    global.swhdb = swhdb
  }

  return swhdb
}

export { localdb, cfgdb, swhdb, getSwhDb }
