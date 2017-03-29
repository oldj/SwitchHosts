/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, hosts, on) => {
  Agent.pact('toggleHosts', hosts.id, on)
    .then(() => {
      hosts.on = on
      app.setState({
        list: app.state.list
      })
    })
    .catch(e => {
      console.log(e)
    })
}
