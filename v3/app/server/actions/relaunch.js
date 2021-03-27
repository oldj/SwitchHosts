/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {ipcMain} = require('electron')

module.exports = () => {
  return Promise.resolve().then(() => {
    ipcMain.emit('relaunch')
  })
}
