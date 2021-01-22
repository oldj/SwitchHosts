/**
 * agent
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ipcMain } from 'electron'

export const broadcast = (event: string, ...args: any[]) => {
  ipcMain.emit('x_broadcast', null, { event, args })
}
