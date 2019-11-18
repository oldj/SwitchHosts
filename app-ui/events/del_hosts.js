/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
import treeFunc from '../../app/libs/treeFunc'

module.exports = (app, hosts) => {
  let list = app.state.list
  let id = hosts.id
  let neighbors = [treeFunc.getUpItemWithCollapseState(list, id), treeFunc.getDownItemWithCollapseState(list, id)]
  list = treeFunc.removeItemFromTreeById(list, hosts.id)
  let next_hosts = neighbors[1] || neighbors[0] || null

  //let idx = list.findIndex(item => item.id === hosts.id)
  //if (idx === -1) {
  //  return
  //}
  //
  //list.splice(idx, 1)

  Agent.pact('saveHosts', list)
    .then(list => {
      app.setState({list, current: next_hosts})
    })
    .catch(e => console.log(e))
}
