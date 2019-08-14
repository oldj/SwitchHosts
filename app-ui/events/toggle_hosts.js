/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
import save from './save'
import treeFunc from '../../app/libs/treeFunc'

module.exports = async (app, hosts) => {
  hosts.on = !hosts.on
  let {id} = hosts
  let lang = app.state.lang

  let pref = await Agent.pact('getPref')
  let list = app.state.list.slice(0)
  let flat_list = treeFunc.flatTree(list)
  let is_single = pref.choice_mode === 'single'

  if (is_single && hosts.on) {
    flat_list.map(item => {
      if (item.id !== id) {
        item.on = false
      }
    })
  }

  let item = flat_list.find(item => item.id === id)
  if (!item) {
    list.push(Object.assign({}, hosts))
  } else {
    item.on = hosts.on
  }

  await save(app, list, hosts)

  Agent.pact('statRecord', 'switch')
    .catch(e => console.log(e))
  Agent.pact('notify', 'SwitchHosts!', lang.hosts_switched)
    .catch(e => console.log(e))
}
