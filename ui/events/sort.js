/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
const updated  = require('./list_updated')

module.exports = (app, ids) => {
  let list = app.state.list
  let new_list = []
  ids.map(id => {
    let item = list.find(i => i.id === id)
    if (item) {
      new_list.push(item)
    }
  })

  Agent.pact('saveHosts', new_list)
    .then(list => {
      updated(app, list)
    })
    .catch(e => console.log(e))
}
