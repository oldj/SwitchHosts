/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
import treeFunc from '../../app/libs/treeFunc'

module.exports = (app, hosts) => {
  let list = app.state.list
  let neighbors = treeFunc.getNeighbors(list, hosts.id)
  list = treeFunc.removeItemFromTreeById(list, hosts.id)

  //let idx = list.findIndex(item => item.id === hosts.id)
  //if (idx === -1) {
  //  return
  //}
  //
  //list.splice(idx, 1)

  Agent.pact('saveHosts', list)
    .then(list => {
      app.setState({list}, () => {
        // 选中下一个 hosts
        let next_hosts = neighbors.next || neighbors.previous || null
        if (next_hosts) {
          app.setState({current: next_hosts})
        }
      })
    })
    .catch(e => console.log(e))
}
