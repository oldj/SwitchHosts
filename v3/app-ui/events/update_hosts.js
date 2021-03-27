/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

//import Agent from '../Agent'
//import cleanData from '../../app/server/cleanData'
import treeFunc from '../../app/libs/treeFunc'
import save from './save'

module.exports = async (app, hosts) => {
  let {list} = app.state
  let old_hosts = treeFunc.getItemById(list, hosts.id)
  if (!old_hosts) {
    list.push(Object.assign({}, hosts))
  } else {
    //list.splice(idx, 1, Object.assign({}, old_hosts, hosts))
    Object.assign(old_hosts, hosts)
  }

  await save(app, list, hosts)
}
