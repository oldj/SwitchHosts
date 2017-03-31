/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
import updated from './list_updated'

module.exports = (app, list, hosts = null) => {
  Agent.pact('saveHosts', list)
    .then(new_list => {
      updated(app, new_list, hosts)
    })
    .catch(e => {
      console.log(e)
    })
}
