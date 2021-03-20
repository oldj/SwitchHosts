/**
 * keys
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { isDir, isFile } from '../utils/fs2'
import { promises as fs } from 'fs'
import * as path from 'path'

export interface IKeys {
  dict: string[];
  list: string[];
  set: string[];
  collection: string[];
}

const byFile = (dir: string, filenames: string[], ext: string = '.json'): string[] => {
  return filenames
    .filter(fn => {
      if (!fn.endsWith(ext)) return false
      let p = path.join(dir, fn)
      return isFile(p)
    })
    .map(fn => fn.substring(0, fn.length - ext.length))
}

const byDir = (dir: string, filenames: string[]): string[] => {
  return filenames.filter(fn => isDir(path.join(dir, fn)))
}

const getKeys = async (dir: string): Promise<IKeys> => {
  const types: (keyof IKeys)[] = [ 'dict', 'list', 'set', 'collection' ]
  let data: Partial<IKeys> = {}

  for (let type of types) {
    let keys: string[] = []
    let target_dir = path.join(dir, type)
    if (!isDir(target_dir)) continue
    let items = await fs.readdir(target_dir)
    if (type === 'collection') {
      keys = byDir(target_dir, items)
    } else {
      keys = byFile(target_dir, items)
    }

    data[type] = keys.sort()
  }

  return data as IKeys
}

export default getKeys
