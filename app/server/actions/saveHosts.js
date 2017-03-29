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

function tryToApply (svr, cnt) {
  return new Promise((resolve, reject) => {
    apply(cnt)
      .then(() => resolve())
      .catch(e => {
        if (e !== 'need_sudo') {
          reject(e)
          return
        }

        sudo(svr)
          .then(() => {
            apply(cnt)
              .then(() => resolve())
              .catch(e => reject(e))
          })
          .catch(e => reject(e))
      })
  })
}

module.exports = (svr, list) => {
  let fn = paths.data_path
  let data = {
    list,
    version
  }
  let cnt = JSON.stringify(data)
  cnt = jsbeautify(cnt, {
    indent_size: 2
  })

  // try to update system hosts
  return tryToApply(svr, cnt)
    .then(() => io.pWriteFile(fn, cnt))
    .catch(e => console.log(e))
}
