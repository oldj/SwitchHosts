/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as path from 'path'
import Db from 'potdb'
import { fileURLToPath } from 'url'
import { getSwhDb, swhdb } from '../src/main/data'

const dirname = path.dirname(fileURLToPath(import.meta.url))

global.db_dir = path.join(dirname, 'tmp', 'db')

declare global {
  namespace NodeJS {
    interface Global {
      db_dir?: string;
      swhdb: Db;
    }
  }
}

const clearData = async () => {
  const db = swhdb || (await getSwhDb())
  await db.collection.hosts.remove()
  await db.collection.trashcan.remove()
  await db.list.tree.remove()
}

export {
  clearData,
}
