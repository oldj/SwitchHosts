/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
const updated = require('./list_updated')

module.exports = (app, list, hosts = null) => {
  return Agent.pact('saveHosts', list)
    .then(new_list => updated(app, new_list, hosts))
    //.then(() => {
    //  console.log('saved.', hosts && hosts.content.substring(0, 50))
    //})
    .catch(e => {
      console.log(e)
    })
}
