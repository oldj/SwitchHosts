/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { makeWindow } from '@main/ui/find'

export default async () => {
  if (!global.find_win) {
    global.find_win = await makeWindow()
  }

  global.find_win?.show()
  global.find_win?.focus()
}
