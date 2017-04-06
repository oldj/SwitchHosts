/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, new_list, hosts = null) => {
  let state = {list: new_list}
  return Agent.pact('getSysHosts')
    .then(sys_hosts => {
      state.sys_hosts = sys_hosts

      if (hosts) {
        state.current = hosts
      } else if (app.state.current) {
        let c = new_list.find(i => i.id === app.state.current.id)
        if (c) {
          state.current = c
        }
      }
      let current = app.state.current
      if (current.is_sys) {
        state.current = sys_hosts
      }

      app.setState(state, () => {
        if (hosts) {
          Agent.emit('select', hosts.id)
        }
      })
    })
}
