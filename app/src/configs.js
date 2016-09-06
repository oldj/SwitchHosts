/**
 * configs.js
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const m_ver = require('./version').version;

exports.version = m_ver.slice(0, 3).join('.');
exports.version_full = m_ver.join('.');

