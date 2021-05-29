/**
 * quit
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { app } from 'electron'

export default async () => {
  console.log('to quit...')
  try {
    global.main_win.webContents.closeDevTools()
  } catch (e) {
    console.error(e)
  }
  app.quit()
}
