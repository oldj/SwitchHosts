/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const m_lang = require('../lang')

exports.getLang = (user_lang = 'en') => {
  let lang = m_lang.getLang(user_lang)

  return Promise.resolve().then(() => lang)
}
