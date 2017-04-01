/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const m_ver = require('./version').version

module.exports = {
  PORT: 50761,
  version: m_ver.slice(0, 3).join('.'),
  version_full: m_ver.join('.'),
  url_download: 'https://github.com/oldj/SwitchHosts/releases'
}
