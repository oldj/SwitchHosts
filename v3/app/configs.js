/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const m_ver = require('./version')

module.exports = {
  PORT: 50761,
  version: m_ver.slice(0, 3).join('.'),
  version_full: m_ver.join('.'),
  url_download: 'https://github.com/oldj/SwitchHosts/releases',
  url_feedback: 'https://github.com/oldj/SwitchHosts/issues',
  url_home: 'https://oldj.github.io/SwitchHosts/'
}
