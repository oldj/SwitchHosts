/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'
const update = require('./update_hosts')

module.exports = (app, hosts) => {
  hosts.on = !hosts.on
  update(app, hosts)

  Agent.pact('statRecord', 'switch')
}
