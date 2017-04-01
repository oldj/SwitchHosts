/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, new_list, hosts = null) => {
  let state = {list: new_list}
  Agent.pact('getSysHosts')
    .then(sys_hosts => {
      state.sys_hosts = sys_hosts

      if (hosts) {
        state.current = hosts
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
