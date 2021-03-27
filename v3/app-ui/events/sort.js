/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
import updated from './list_updated'
import {flatTree} from '../../app/libs/treeFunc'
//const updated = require('./list_updated')

module.exports = async (app, tree = []) => {
  let list = flatTree(app.state.list)

  function updateTree (list2, tree2) {
    tree2.map(({id, children}) => {
      let item = list.find(i => i.id === id)
      if (item) {
        list2.push(item)
        item.children = updateTree([], children)
      }
    })

    return list2
  }

  let new_list = updateTree([], tree)

  list = await Agent.pact('saveHosts', new_list)
  await updated(app, list)
}
