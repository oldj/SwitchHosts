/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict';

const version = require('../../version').version
const paths = require('../paths')
const io = require('../io')
const jsbeautify = require('js-beautify').js_beautify

module.exports = (list) => {
  let fn = paths.data_path
  let data = {
    list,
    version
  }
  let cnt = JSON.stringify(data)
  cnt = jsbeautify(cnt, {
    indent_size: 2
  })

  // todo try to update system hosts

  return io.pWriteFile(fn, cnt)
}
