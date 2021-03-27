/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const lang = require('../lang')

module.exports = () => {
  return Promise.resolve().then(() => lang.lang_list)
}
