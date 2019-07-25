/**
 * toImport
 * @author: oldj
 * @homepage: https://oldj.net
 */

const path = require('path')
const {app, dialog} = require('electron')
const paths = require('../paths')

module.exports = async (svr) => {
  let download_path = app.getPath('downloads')
  let {lang} = global

  dialog.showSaveDialog({
    title: lang.export,
    defaultPath: path.join(global.last_path || download_path || paths.home_path, 'sh.json'),
    filters: [
      {name: 'JSON', extensions: ['json']},
      {name: 'All Files', extensions: ['*']}
    ]
  }, async (fn) => {
    if (fn) {
      //svr.emit('to_export', fn)
      global.last_path = path.dirname(fn)
      await require('./exportData')(svr, fn)
    }
  })
}
