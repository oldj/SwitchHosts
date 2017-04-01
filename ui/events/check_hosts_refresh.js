/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, hosts) => {
  let list = app.state.list
  Agent.pact('checkNeedRemoteRefresh', list, hosts)
    .then(list => {
      if (!list) return
      Agent.emit('list_updated', list)
    })
    .catch(e => {
      console.log(e)
    })
}
