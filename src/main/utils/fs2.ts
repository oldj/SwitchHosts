/**
 * fs2
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as fs from 'fs'

export const isDir = (dir_path: string): boolean => {
  return fs.existsSync(dir_path) && fs.lstatSync(dir_path).isDirectory()
}
