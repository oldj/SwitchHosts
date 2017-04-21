/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, new_list, hosts = null) => {
  let state = {list: new_list}
  return Promise.resolve()
    .then(() => {
      let current = app.state.current
      if (current && current.is_sys) {
        return Agent.pact('getSysHosts')
          .then(sys_hosts => {
            state.sys_hosts = sys_hosts
            state.current = sys_hosts
          })
      } else if (hosts) {
        state.current = hosts
      } else if (current) {
        let c = new_list.find(i => i.id === current.id)
        if (c) {
          state.current = c
        }
      }
    })
    .then(() => {
      app.setState(state, () => {
        if (hosts) {
          Agent.emit('select', hosts.id)
        }
      })
    })
}
