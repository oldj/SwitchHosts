/**
 * @author oldj
 * @blog https://oldj.net
 *
 * 读取系统 hosts 以及本地保存的 hosts 数据
 */

'use strict'

const getSysHosts = require('./getSysHosts')
const getUserHosts = require('./getUserHosts')

module.exports = () => {
  return Promise
    .all([getSysHosts(), getUserHosts()])
    .then(([sys_hosts, user_hosts]) => {
      return {
        sys_hosts: sys_hosts,
        list: user_hosts
      }
    })
}
