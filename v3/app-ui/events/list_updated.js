/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
import {flatTree} from '../../app/libs/treeFunc'

module.exports = async (app, new_list, hosts = null) => {
  let state = {
    list: new_list
  }

  let current = app.state.current
  if (current && current.is_sys) {
    let sys_hosts = await Agent.pact('getSysHosts')
    state.sys_hosts = sys_hosts
    state.current = sys_hosts

  } else if (hosts) {
    state.current = hosts

  } else if (current) {
    let c = flatTree(new_list).find(i => i.id === current.id)
    if (c) {
      state.current = c
    }
  }

  app.setState(state, () => {
    if (hosts) {
      Agent.emit('select', hosts.id)
    }
  })
}
