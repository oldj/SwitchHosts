/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

module.exports = () => {
  return (new Date()).getTime() + '-' + Math.floor(Math.random() * 1e6)
}
