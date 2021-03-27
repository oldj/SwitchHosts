/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const is_win32 = process.platform === 'win32'
const br = is_win32 ? '\r\n' : '\n'

module.exports = (content) => {
  return content.replace(/\r/g, '').split('\n').join(br)
}
