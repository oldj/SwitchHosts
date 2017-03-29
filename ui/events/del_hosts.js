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
        let id = (list[idx] || list[idx - 1] || {}).id
        if (id) {
          Agent.emit('select', id)
        }
      })
    })
}
