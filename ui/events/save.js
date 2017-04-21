/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
const updated = require('./list_updated')

module.exports = (app, list, hosts = null) => {
  return Agent.pact('saveHosts', list)
    .then(new_list => {
      updated(app, new_list, hosts)
    })
    .catch(e => {
      console.log(e)
    })
}
