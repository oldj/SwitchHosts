/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
//import makeId from '../../app/libs/make-id'

module.exports = (app, hosts) => {
  let list = app.state.list
  let inner = list.find(item => item.id === hosts.id)
  if (!inner) {
    list.push(Object.assign({}, hosts))
  } else {
    Object.assign(inner, hosts)
  }

  Agent.pact('saveHosts', list)
    .then(() => {
      app.setState({list}, () => {
        Agent.emit('select', hosts.id)
      })
    })
}
