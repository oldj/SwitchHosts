/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, new_list, hosts = null) => {
  let state = {list: new_list}
  let current = app.state.current
  let item = new_list.find(i => i.id === current.id)
  if (item) {
    state.current = item
  }

  app.setState(state, () => {
    if (hosts) {
      Agent.emit('select', hosts.id)
    }
  })
}
