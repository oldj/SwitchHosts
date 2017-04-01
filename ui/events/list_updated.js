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

      let current = app.state.current
      if (current.is_sys) {
        state.current = sys_hosts
      } else {
        let item = new_list.find(i => i.id === current.id)
        if (item) {
          state.current = item
        }
      }

      app.setState(state, () => {
        if (hosts) {
          Agent.emit('select', hosts.id)
        }
      })
    })
}
