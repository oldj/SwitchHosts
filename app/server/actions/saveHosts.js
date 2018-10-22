/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const version = require('../../version').version
const paths = require('../paths')
const io = require('../io')
const jsbeautify = require('js-beautify').js_beautify
const apply = require('../apply')
const sudo = require('../sudo')
const makeOutHosts = require('../makeOutHosts')
const cleanData = require('../cleanData')
const chromeDnsClear = require('../../libs/chrome-dns-clear')
//const checkAllRemoteHostses = require('./checkAllRemoteHostses')

function tryToApply (svr, cnt, pswd) {
  return new Promise((resolve, reject) => {
    return apply(cnt, pswd)
      .then(() => resolve())
      .catch(e => {
        if (e !== 'need_sudo') {
          reject(e)
          return
        }

        sudo(svr)
          .then(pswd => {
            return tryToApply(svr, cnt, pswd)
              .then(() => resolve())
              .catch(e => reject(e))
          })
          .catch(e => reject(e))
      })
  })
}

module.exports = (svr, list) => {
  //return checkAllRemoteHostses(svr, list, cfg)
  return Promise.resolve()
    .then(() => cleanData(list))
    .then(list => {
      let fn = paths.data_path
      let data = {
        list,
        version
      }
      let cnt = JSON.stringify(data)
      cnt = jsbeautify(cnt, {
        indent_size: 2
      })

      let out = makeOutHosts(list)

      // clear chrome dns cache by remote debugger
      chromeDnsClear();

      // try to update system hosts
      return tryToApply(svr, out)
        .then(() => io.pWriteFile(fn, cnt))
        .then(() => svr.emit('hosts_saved'))
        .then(() => list)
    })
}
