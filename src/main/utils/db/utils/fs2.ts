/**
 * ensureDir
 * @author: oldj
 * @homepage: https://oldj.net
 */

import fs from 'fs'
import mkdirp from 'mkdirp'

export const isDir = (dir_path: string) => {
  return fs.existsSync(dir_path) && fs.lstatSync(dir_path).isDirectory()
}

export const isFile = (dir_path: string) => {
  return fs.existsSync(dir_path) && fs.lstatSync(dir_path).isFile()
}

export const ensureDir = async (dir_path: string) => {
  if (isDir(dir_path)) return
  await mkdirp(dir_path)
}
