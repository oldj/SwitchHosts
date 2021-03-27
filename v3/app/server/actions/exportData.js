/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const {Notification} = require('electron')
const paths = require('../paths')
const io = require('../io')
const version = require('../../version')

module.exports = async (svr, fn) => {
  let {lang} = global
  let data_path = paths.data_path
  let cnt = '{}'

  if (io.isFile(data_path)) {
    cnt = await io.pReadFile(data_path)
  }

  let data
  try {
    data = JSON.parse(cnt)
  } catch (e) {
    console.log(e)
  }
  data.version = version

  cnt = JSON.stringify(data)
  await io.pWriteFile(fn, cnt)

  let notify = new Notification({
    title: lang.export,
    body: lang.export_finish
  })

  notify.show()
}
