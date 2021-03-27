/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
const updated = require('./list_updated')

module.exports = (app, on, on_ids, callback) => {
  let list = app.state.list

  let new_list = list.map(item => {
    let new_item = Object.assign({}, item)
    new_item.on = !!(on && on_ids.includes(item.id))

    return new_item
  })

  Agent.pact('saveHosts', new_list)
    .then(list => {
      //app.setState({list: new_list})
      updated(app, list)
      //app.forceUpdate()
      callback()
    })
    .catch(e => callback(e))
}
