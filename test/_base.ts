/**
 * base
 * @author: oldj
 * @homepage: https://oldj.net
 */

import assert = require('assert')
import * as path from 'path'

global.db_dir = path.join(__dirname, 'tmp', 'db')

import { swhdb } from '@root/main/data'
import Db from 'potdb'

declare global {
  namespace NodeJS {
    interface Global {
      db_dir?: string;
      swhdb: Db;
    }
  }
}

const clearData = async () => {
  await swhdb.collection.hosts.remove()
  await swhdb.collection.trashcan.remove()
  await swhdb.list.tree.remove()
}

export {
  assert,
  clearData,
}
