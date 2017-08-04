/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, hosts) => {
  let list = app.state.list
  let idx = list.findIndex(item => item.id === hosts.id)
  if (idx === -1) {
    return
  }

  list.splice(idx, 1)

  Agent.pact('saveHosts', list)
    .then(() => {
      app.setState({list}, () => {
        // 选中下一个 hosts
        let next_hosts = list[idx] || list[idx - 1] || null
        if (next_hosts) {
          app.setState({current: next_hosts})
        }
      })
    })
    .catch(e => console.log(e))
}
