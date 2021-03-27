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
      Agent.emit('refresh_end', hosts.id)
      if (!list) return
      Agent.emit('list_updated', list)
    })
    .catch(e => {
      console.log(e)
      Agent.emit('refresh_end', hosts.id)
      Agent.emit('err', {
        title: 'Remote Hosts Refresh Error',
        content: e.code
      })
    })
}
