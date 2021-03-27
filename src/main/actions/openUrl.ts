/**
 * @author oldj
 * @blog https://oldj.net
 */

import { shell } from 'electron'

export default async (url: string) => {
  await shell.openExternal(url)
}
