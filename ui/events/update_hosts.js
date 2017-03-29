/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, hosts) => {
  let list = app.state.list.slice(0)
  let idx = list.findIndex(item => item.id === hosts.id)
  if (idx === -1) {
    list.push(Object.assign({}, hosts))
  } else {
    let old_hosts = list[idx]
    list.splice(idx, 1, Object.assign({}, old_hosts, hosts))
  }

  Agent.pact('saveHosts', list)
    .then(() => {
      app.setState({list}, () => {
        Agent.emit('select', hosts.id)
      })
    })
}
