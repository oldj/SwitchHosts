/**
 * drag_done
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { updateTree } from '../../app/libs/treeFunc'
import Agent from '../Agent'
import updated from './list_updated'

module.exports = async (app, updates) => {
  let {list} = app.state
  list = updateTree(list, updates)
  app.setState({list})

  list = await Agent.pact('saveHosts', list)
  await updated(app, list)
}
