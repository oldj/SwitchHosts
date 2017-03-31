/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
import cleanData from '../../app/server/cleanData'

module.exports = (app, hosts) => {
  let list = app.state.list.slice(0)
  let idx = list.findIndex(item => item.id === hosts.id)
  if (idx === -1) {
    list.push(Object.assign({}, hosts))
  } else {
    let old_hosts = list[idx]
    list.splice(idx, 1, Object.assign({}, old_hosts, hosts))
  }

  list = cleanData(list)

  Agent.pact('saveHosts', list)
    .then(() => {
      let state = {list}
      let current = app.state.current
      let item = list.find(i => i.id === current.id)
      if (item) {
        state.current = item
      }

      app.setState(state, () => {
        Agent.emit('select', hosts.id)
      })
    })
    .catch(e => console.log(e))
}
