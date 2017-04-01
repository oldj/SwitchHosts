/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {ipcMain} = require('electron')

module.exports = () => {
  ipcMain.emit('relaunch')
}
